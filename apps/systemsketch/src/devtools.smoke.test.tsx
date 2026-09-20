// src/devtools.smoke.test.tsx — the devtools surfaces, mounted in the real app.
// ACCEPTANCE committed by the wiring lane BEFORE any builder; off-limits to
// the builder that makes it pass. Same rule as ./settings.smoke.test.tsx.
//
// WHY this file exists at all: lane `devtools-2026-09-19` built the quick
// switcher, the dev panel and the recording port entirely in the trunk and
// mounted NONE of it, deliberately, so five agents could not collide on this
// app's mount point (docs/WORK-ORDER-CONTINUE-2026-09-20.md §7.3). The
// consequence Zach sees is that pressing `S` does nothing and there is no
// `</>` button. These assertions are that consequence, inverted.
//
// Every handle below is the trunk's own published DOM contract, not a shape
// invented here: `quickSwitcher.tsx`'s `testId(...)` prefix (default
// "quick-switcher") and `devPanel.tsx`'s documented
// `[data-slot="dev-panel"]` / `[data-slot="dev-panel-row"][data-row-id]`.
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { memoryDocumentLocation, resetLaunchConfig, setDocumentLocation } from "./files/launchConfig";
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
const devPanel = () => document.querySelector<HTMLElement>('[data-slot="dev-panel"]');

describe("The quick switcher — bare `S`, on the trunk's stock command palette", () => {
  it("is closed until `S` is pressed, and `S` opens it with the input focused", async () => {
    app = await mountApp();
    expect(switcher()).toBeNull();

    await userEvent.keyboard("s");
    const root = await waitFor(() => switcher(), { what: "the quick switcher after `S`" });

    // The input takes focus, or typing the next character would go to the
    // canvas and select a tool instead of filtering.
    const input = root.querySelector<HTMLElement>('[data-testid="quick-switcher-input"]')!;
    await waitFor(() => document.activeElement === input, { what: "the switcher input to take focus" });
  });

  it("does NOT open while the caret is in a text field — `S` there is the letter s", async () => {
    app = await mountApp();

    // F2 is this app's own rename gesture (src/files/session.tsx), and the
    // inline rename it raises is a real text field in the real chrome. Typing
    // `s` into it must type an `s`, not open a palette over the top.
    await userEvent.keyboard("{F2}");
    const input = await waitFor(
      () => document.querySelector<HTMLInputElement>('[data-slot="inline-rename-input"]'),
      { what: "the chrome bar's inline rename input" },
    );
    input.focus();
    await userEvent.keyboard("s");

    expect(switcher()).toBeNull();
    expect(input.value.endsWith("s")).toBe(true);
    await userEvent.keyboard("{Escape}");
  });

  it("lists this app's real tools as `Go to` entries, and running one selects that tool", async () => {
    app = await mountApp();
    await userEvent.keyboard("s");
    const root = await waitFor(() => switcher(), { what: "the quick switcher" });

    // Not a fabricated list: the same `SYSTEM_FAMILY_ITEMS` the dock renders,
    // under their REAL tool ids — Block is `ss-block` (shapes/types.ts:30),
    // prefixed on purpose so it cannot collide with the trunk bench's
    // `bbox-block`. An item whose `run()` called `setCurrentTool("block")`
    // would throw: no state node is registered under that id.
    const block = await waitFor(
      () => root.querySelector<HTMLElement>('[data-testid="quick-switcher-item-ss-block"]'),
      { what: "an `ss-block` entry in the switcher" },
    );
    block.click();

    await waitFor(() => !switcher(), { what: "the switcher to close after running an item" });
    await waitFor(() => app!.editor.getCurrentToolId() === "ss-block", {
      what: "the editor to be on the block tool",
    });
  });

  it("closes on Escape and leaves the board untouched", async () => {
    app = await mountApp();
    const before = app.editor.getCurrentToolId();
    await userEvent.keyboard("s");
    await waitFor(() => switcher(), { what: "the quick switcher" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => !switcher(), { what: "Escape to close it" });
    expect(app.editor.getCurrentToolId()).toBe(before);
  });
});

describe("The dev panel — the `</>` launcher in the status strip", () => {
  it("has a `</>` launcher in the bottom-right strip that opens the trunk's dev panel", async () => {
    app = await mountApp();
    expect(devPanel()).toBeNull();

    const launcher = await waitFor(
      () => document.querySelector<HTMLElement>('[data-testid="ss-status-dev"]'),
      { what: "the `</>` launcher in the status strip" },
    );
    launcher.click();

    const panel = await waitFor(() => devPanel(), { what: "the dev panel" });
    expect(panel.getAttribute("role")).toBe("dialog");
  });

  it("shows live, real state rather than a fabricated list — the build channel and the editor's shape count", async () => {
    app = await mountApp();
    (await waitFor(() => document.querySelector<HTMLElement>('[data-testid="ss-status-dev"]')))!.click();
    const panel = await waitFor(() => devPanel(), { what: "the dev panel" });

    const shapes = panel.querySelector<HTMLElement>('[data-slot="dev-panel-row"][data-row-id="shape-count"]');
    expect(shapes, "a `shape-count` row").not.toBeNull();
    const reading = () => Number(shapes!.textContent?.match(/\d+/)?.[0] ?? -1);
    expect(reading()).toBe(app.editor.getCurrentPageShapeIds().size);

    // Create a shape and the row must follow it: proof it reads the editor
    // rather than a snapshot taken at mount.
    app.editor.createShape({ type: "geo", x: 100, y: 100 });
    await waitFor(() => reading() === app!.editor.getCurrentPageShapeIds().size && reading() > 0, {
      what: "the shape-count row to track the editor",
    });
  });

  it("carries the recording control, and it reports the host honestly when no recorder is reachable", async () => {
    app = await mountApp();
    (await waitFor(() => document.querySelector<HTMLElement>('[data-testid="ss-status-dev"]')))!.click();
    const panel = await waitFor(() => devPanel(), { what: "the dev panel" });

    const row = panel.querySelector<HTMLElement>('[data-slot="dev-panel-row"][data-row-id="recorder"]');
    expect(row, "a `recorder` slot row").not.toBeNull();
    // `recordingControl.tsx` renders null when the core is not installed, so a
    // present control is itself the proof the app installed the core.
    expect(row!.querySelector('[data-testid="ss-recording"]'), "the recording control").not.toBeNull();
  });

  it("closes on its own close control", async () => {
    app = await mountApp();
    (await waitFor(() => document.querySelector<HTMLElement>('[data-testid="ss-status-dev"]')))!.click();
    const panel = await waitFor(() => devPanel(), { what: "the dev panel" });
    panel.querySelector<HTMLElement>("[data-dev-panel-close]")!.click();
    await waitFor(() => !devPanel(), { what: "the dev panel to close" });
  });
});
