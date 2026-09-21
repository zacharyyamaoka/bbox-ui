// src/boardFind.smoke.test.tsx — parity item P-024, "Ctrl+F opens board Find
// and Replace", driven end to end in the real app.
//
// The claim this file exists to keep honest: NOT "a Find tab renders" — the
// trunk's own story already measures that — but that a real Ctrl+F on the real
// board finds text that only the DOCUMENT knows about, and that Replace All
// changes the SHAPES.
//
// That distinction is the whole point of the gate. The board search is only
// worth anything if it sees what the browser's own Ctrl+F cannot: text on a
// shape that is not painted in the viewport, and text on another page. So one
// of the fixtures below is placed 4000px off-screen and one lives on a second
// page, and the assertions are read off `editor.getShape(...)`, never off the
// rendered row.
import { createShapeId, type TLShapeId } from "tldraw";
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { memoryDocumentLocation, resetLaunchConfig, setDocumentLocation } from "./files/launchConfig";
import type { BlockShape } from "./shapes/block/BlockShapeUtil";
import { BLOCK_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;

beforeEach(() => {
  setDocumentLocation(memoryDocumentLocation());
});

afterEach(() => {
  app?.unmount();
  app = null;
  resetLaunchConfig();
});

const switcher = () => document.querySelector<HTMLElement>('[data-testid="quick-switcher-root"]');
// WHY `[data-source-id]` and not `[data-testid^="quick-switcher-match-"]`:
// the Match-case toggle's own test id is `quick-switcher-match-case`, so the
// prefix selector counts it as a result row. (It did, for one run of this
// file: "saw 1" with nothing found at all.) `data-source-id` is on match rows
// and nothing else.
const matchRows = () => Array.from(document.querySelectorAll<HTMLElement>("[data-source-id]"));

function placeBlock(name: string, x: number, y: number): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({
    id,
    type: BLOCK_SHAPE_TYPE,
    x,
    y,
    props: { name, description: "", view: "port", w: 220, h: 140, ports: { left: [], right: [], top: [], bottom: [] } },
  } as never);
  return id;
}

const nameOf = (id: TLShapeId) => (app!.editor.getShape(id) as BlockShape).props.name;

/**
 * Ctrl+F, then type — and the focus assertion in the middle is load-bearing,
 * not ceremony. Before `quickSwitcher.tsx` focused its input on open, Ctrl+F
 * left `document.activeElement` on the "Find" TAB BUTTON (the mode changes
 * after the dialog mounts, and a Tabs value change takes focus), so every
 * character went nowhere and the box stayed empty. A test that clicked the
 * input first would have passed over that with the feature broken.
 */
async function openFindAndType(query: string): Promise<void> {
  await userEvent.keyboard("{Control>}f{/Control}");
  const root = await waitFor(() => switcher(), { what: "the quick switcher after Ctrl+F" });
  const input = await waitFor(
    () => root.querySelector<HTMLInputElement>('[data-testid="quick-switcher-input"]'),
    { what: "the switcher input" },
  );
  await waitFor(() => document.activeElement === input, {
    what: `Ctrl+F to put the caret in the find box; it was on ${document.activeElement?.tagName}`,
  });
  await userEvent.keyboard(query);
  await waitFor(() => input.value === query, { what: `the query to land; box reads "${input.value}"` });
}

describe("Ctrl+F — board Find and Replace", () => {
  it("opens the switcher on its FIND half, which a bare `S` does not", async () => {
    app = await mountApp();
    expect(switcher()).toBeNull();

    await userEvent.keyboard("{Control>}f{/Control}");
    const root = await waitFor(() => switcher(), { what: "the quick switcher after Ctrl+F" });

    // `aria-selected` is the tab's own state, not a class we chose.
    await waitFor(
      () =>
        root
          .querySelector('[data-testid="quick-switcher-mode-find"]')
          ?.getAttribute("aria-selected") === "true",
      { what: "the Find tab to be the selected one" },
    );

    // And the same surface opened with `S` is still the Go to half — the two
    // bindings are genuinely different, which is the thing that was missing.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => switcher() === null, { what: "the switcher to close" });
    await userEvent.keyboard("s");
    const reopened = await waitFor(() => switcher(), { what: "the quick switcher after `S`" });
    await waitFor(
      () =>
        reopened
          .querySelector('[data-testid="quick-switcher-mode-go-to"]')
          ?.getAttribute("aria-selected") === "true",
      { what: "the Go to tab to be the selected one after `S`" },
    );
  });

  it("finds text the browser's own Ctrl+F cannot: off-screen, and on another page", async () => {
    app = await mountApp();
    const onScreen = placeBlock("Kalman filter", 120, 200);
    // 4000px right of a 1400px viewport pinned at the origin: never painted.
    const offScreen = placeBlock("Kalman residual", 4000, 200);

    const firstPage = app.editor.getCurrentPageId();
    app.editor.createPage({ name: "Second page" });
    const secondPage = app.editor.getPages().find((page) => page.id !== firstPage)!;
    app.editor.setCurrentPage(secondPage.id);
    const elsewhere = placeBlock("Kalman gain", 120, 200);
    app.editor.setCurrentPage(firstPage);

    await openFindAndType("Kalman");

    const rows = await waitFor(() => (matchRows().length === 3 ? matchRows() : null), {
      what: `three matches; saw ${matchRows().length}`,
    });
    const found = rows.map((row) => row.dataset.sourceId);
    expect(found).toContain(String(onScreen));
    expect(found).toContain(String(offScreen));
    expect(found).toContain(String(elsewhere));
  });

  it("Replace All writes the SHAPES, on every page, in one undo step", async () => {
    app = await mountApp();
    const here = placeBlock("Kalman filter", 120, 200);
    const firstPage = app.editor.getCurrentPageId();
    app.editor.createPage({ name: "Second page" });
    const secondPage = app.editor.getPages().find((page) => page.id !== firstPage)!;
    app.editor.setCurrentPage(secondPage.id);
    const there = placeBlock("Kalman gain", 120, 200);
    app.editor.setCurrentPage(firstPage);

    await openFindAndType("Kalman");
    await waitFor(() => (matchRows().length === 2 ? true : null), { what: "two matches" });

    const replacement = await waitFor(
      () => document.querySelector<HTMLInputElement>('[data-testid="quick-switcher-replacement"]'),
      { what: "the replacement field" },
    );
    await userEvent.click(replacement);
    await userEvent.keyboard("Bayes");
    await userEvent.click(
      document.querySelector<HTMLElement>('[data-testid="quick-switcher-replace-all"]')!,
    );

    await waitFor(() => nameOf(here) === "Bayes filter", { what: `this page's block; saw "${nameOf(here)}"` });
    expect(nameOf(there)).toBe("Bayes gain");

    // One gesture, one undo step (@trunk/scene/history.ts, clause 1), and the
    // step is EXACTLY the replacement: one undo puts both pages' names back
    // and leaves the blocks themselves alone. Without the history mark
    // `applyBoardTextUpdates` sets, this same undo deleted the fixtures —
    // tldraw had coalesced the replacement into the entry that created them.
    app.editor.undo();
    expect(nameOf(here)).toBe("Kalman filter");
    expect(nameOf(there)).toBe("Kalman gain");
  });
});
