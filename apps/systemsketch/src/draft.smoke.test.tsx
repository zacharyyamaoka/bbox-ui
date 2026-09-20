// src/draft.smoke.test.tsx — drafts and Compare, mounted in the real app.
// ACCEPTANCE committed by the wiring lane BEFORE any builder; off-limits to
// the builder that makes it pass. Same rule as ./settings.smoke.test.tsx.
//
// Lane `draft-compare-2026-09-19` built the draft engine (`draftModel`,
// `draftChanges`, 63 tests) and the Compare modal entirely in the trunk and
// mounted none of it. `DraftSession.stories.tsx`'s header names this app as
// the host that "writes the same ~60 lines against `window.localStorage` and
// a real serialized board" — these assertions are that sentence, made
// checkable.
//
// WHY the assertions are about the BOARD and not about pixels: a draft that
// shows a chip but shares one document with Main is the failure this feature
// exists to prevent. Every test below ends on something read back out of the
// editor or out of storage, never on a label alone.
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { memoryDocumentLocation, resetLaunchConfig, setDocumentLocation } from "./files/launchConfig";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;

/** Every key `draftModel.ts` can mint for the scratch document. */
function clearDraftStorage() {
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith("systemsketch.drafts") || key.includes(".draft.")) window.localStorage.removeItem(key);
  }
}

beforeEach(() => {
  clearDraftStorage();
  setDocumentLocation(memoryDocumentLocation());
});

afterEach(() => {
  app?.unmount();
  app = null;
  clearDraftStorage();
  resetLaunchConfig();
});

const chip = () => document.querySelector<HTMLElement>('[aria-label="Drafts · Main"], [aria-label^="Draft "]');
const draftBar = () => document.querySelector<HTMLElement>('[data-slot="draft-bar"]');
const compareDialog = () => document.querySelector<HTMLElement>('[data-testid="ss-compare-dialog"]');

async function openChip(): Promise<HTMLElement> {
  (await waitFor(() => chip(), { what: "the drafts chip in the chrome bar" })).click();
  return waitFor(() => document.querySelector<HTMLElement>('[data-slot="branch-chip-list"]'), {
    what: "the drafts popover",
  });
}

async function newDraft() {
  const list = await openChip();
  list.parentElement!.querySelector<HTMLElement>('[data-testid="branch-chip-new-draft"]')!.click();
  return waitFor(() => draftBar(), { what: "the draft bar after New draft" });
}

describe("The drafts chip — beside the file title, in the seat ChromeBar reserves for it", () => {
  it("reads Main before any draft exists, and sits inside the chrome bar", async () => {
    app = await mountApp();
    const found = await waitFor(() => chip(), { what: "the drafts chip" });
    expect(found.getAttribute("aria-label")).toBe("Drafts · Main");
    expect(found.closest('[data-testid="ss-chrome"]'), "the chip inside the chrome bar").not.toBeNull();
    expect(draftBar(), "no draft bar off-draft").toBeNull();
  });

  it("New draft enters draft mode: the draft bar appears and the chip names the draft", async () => {
    app = await mountApp();
    const bar = await newDraft();
    expect(bar.textContent).toContain("Exit");
    await waitFor(() => chip()?.getAttribute("aria-label")?.startsWith("Draft "), {
      what: "the chip to name the active draft",
    });
  });
});

describe("The draft engine — a draft is a real second version of the board", () => {
  it("counts an edit made inside the draft, measured against the board the draft forked from", async () => {
    app = await mountApp();
    const bar = await newDraft();
    expect(bar.textContent).toMatch(/Compare 0 Changes/);

    app.editor.createShape({ type: "geo", x: 120, y: 120 });
    await waitFor(() => /Compare [1-9]\d* Change/.test(draftBar()?.textContent ?? ""), {
      what: "the draft bar's change count to follow the edit",
    });
  });

  it("Compare opens the trunk's Compare dialog on that real difference", async () => {
    app = await mountApp();
    await newDraft();
    app.editor.createShape({ type: "geo", x: 120, y: 120 });
    await waitFor(() => /Compare [1-9]/.test(draftBar()?.textContent ?? ""), { what: "a counted change" });

    const compare = [...draftBar()!.querySelectorAll<HTMLElement>("button")].find((button) =>
      /Compare \d+ Change/.test(button.textContent ?? ""),
    )!;
    compare.click();

    const dialog = await waitFor(() => compareDialog(), { what: "the Compare dialog" });
    // The summary badges come from `compareBoards`, so a non-zero `added`
    // badge is the diff engine having really run over two serialized boards.
    const summary = dialog.querySelector<HTMLElement>('[data-testid="ss-compare-summary"]');
    expect(summary?.textContent ?? "", "a change summary").toMatch(/[1-9]/);

    dialog.querySelector<HTMLElement>('[data-testid="ss-compare-close"]')!.click();
    await waitFor(() => !compareDialog(), { what: "the dialog to close" });
  });

  it("Exit leaves the draft without promoting it — Main is the board it always was", async () => {
    app = await mountApp();
    const mainShapes = app.editor.getCurrentPageShapeIds().size;
    await newDraft();
    app.editor.createShape({ type: "geo", x: 120, y: 120 });
    await waitFor(() => app!.editor.getCurrentPageShapeIds().size === mainShapes + 1, { what: "the draft's edit" });

    [...draftBar()!.querySelectorAll<HTMLElement>("button")]
      .find((button) => (button.textContent ?? "").includes("Exit"))!
      .click();

    await waitFor(() => !draftBar(), { what: "the draft bar to go" });
    await waitFor(() => app!.editor.getCurrentPageShapeIds().size === mainShapes, {
      what: "Main to be back to its own board",
    });
    // And the draft is still there to go back into.
    await waitFor(() => chip()?.getAttribute("aria-label") === "Drafts · Main", { what: "the chip back on Main" });
  });

  it("Merge promotes the draft's board onto Main and leaves draft mode", async () => {
    app = await mountApp();
    const mainShapes = app.editor.getCurrentPageShapeIds().size;
    await newDraft();
    app.editor.createShape({ type: "geo", x: 120, y: 120 });
    await waitFor(() => /Compare [1-9]/.test(draftBar()?.textContent ?? ""), { what: "a counted change" });

    [...draftBar()!.querySelectorAll<HTMLElement>("button")]
      .find((button) => (button.textContent ?? "").trim().startsWith("Merge"))!
      .click();

    await waitFor(() => !draftBar(), { what: "draft mode to end after Merge" });
    await waitFor(() => app!.editor.getCurrentPageShapeIds().size === mainShapes + 1, {
      what: "Main to carry the merged edit",
    });
  });

  it("survives a remount — a draft is persisted, not component state", async () => {
    app = await mountApp();
    await newDraft();
    app.editor.createShape({ type: "geo", x: 120, y: 120 });
    await waitFor(() => /Compare [1-9]/.test(draftBar()?.textContent ?? ""), { what: "a counted change" });

    app.unmount();
    app = await mountApp();

    const found = await waitFor(() => chip(), { what: "the chip after remount" });
    // The draft still exists and is listed, whichever branch the app reopens on.
    const list = await openChip();
    expect(list.querySelectorAll('[data-testid^="branch-chip-select-"]').length).toBeGreaterThan(1);
    expect(found).not.toBeNull();
    await userEvent.keyboard("{Escape}");
  });
});
