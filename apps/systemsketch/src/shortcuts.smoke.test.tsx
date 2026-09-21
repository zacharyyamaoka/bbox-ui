// src/shortcuts.smoke.test.tsx — the keyboard, measured against the running
// app rather than against the table it is built from.
//
// Zach, 2026-09-21 (triage ruling 4): *"Yes, please unbind B from pencil"*.
// The bug he is describing is not "B does nothing" — B already armed the
// Block. It is that the pencil armed FIRST and he watched it flash. So the
// assertion that matters is a NEGATIVE one, and it cannot be made by reading
// `editor.getCurrentToolId()` afterwards: both tools fire inside a single
// keydown, so by the time anything can poll, the Block has already landed on
// top and the board looks correct. The pencil's arming has to be caught in
// the act.
//
// WHY the spy is on `editor.setCurrentTool` and not on a DOM class or the
// dock's pressed state: that call IS how a tldraw tool entry arms itself
// (`tldraw/dist-esm/lib/ui/hooks/useTools.mjs:75-79` — `onSelect` is
// `editor.setCurrentTool("draw")`), so recording it records exactly the event
// Zach saw and nothing else. Asserting on the dock instead would test a
// re-render, which is the thing that happens to be too fast to see.
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { BLOCK_TOOL_ID } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

/** Record every tool this editor is asked to arm, in order, until `stop()`. */
function recordArmedTools(app: MountedApp): { armed: string[]; stop(): void } {
  const armed: string[] = [];
  const editor = app.editor as unknown as { setCurrentTool(id: string, info?: unknown): unknown };
  const original = editor.setCurrentTool.bind(app.editor);
  editor.setCurrentTool = (id: string, info?: unknown) => {
    armed.push(id);
    return original(id, info);
  };
  return { armed, stop: () => { editor.setCurrentTool = original; } };
}

describe("keyboard — one key, one tool", () => {
  it("B arms the Block and never the pencil, and the pencil keeps D and X", async () => {
    app = await mountApp();
    app.editor.focus();
    await waitFor(() => app!.editor.getInstanceState().isFocused, { what: "tldraw taking focus" });

    const spy = recordArmedTools(app);
    try {
      await userEvent.keyboard("b");
      await waitFor(() => app!.editor.getCurrentToolId() === BLOCK_TOOL_ID, { what: "B arming the Block tool" });
    } finally {
      spy.stop();
    }

    // The whole ruling, in one assertion: "draw" must never appear. Before the
    // release this array was ["draw", BLOCK_TOOL_ID] — both tools fired,
    // stock-first, because tldraw's `handleKeyDown` breaks out of the inner
    // chord loop only and keeps walking the registry.
    expect(spy.armed).toEqual([BLOCK_TOOL_ID]);
    expect(spy.armed).not.toContain("draw");

    // The pencil is unbound from B, not disabled: its own letters still work,
    // and D is what the dock advertises (`chrome/families.tsx`'s DRAW row,
    // `shortcutHint: "D"`).
    const afterD = recordArmedTools(app);
    try {
      await userEvent.keyboard("d");
      await waitFor(() => app!.editor.getCurrentToolId() === "draw", { what: "D arming the pencil" });
    } finally {
      afterD.stop();
    }
    expect(afterD.armed).toEqual(["draw"]);

    const afterX = recordArmedTools(app);
    try {
      app.editor.setCurrentTool("select");
      await userEvent.keyboard("x");
      await waitFor(() => app!.editor.getCurrentToolId() === "draw", { what: "X arming the pencil" });
    } finally {
      afterX.stop();
    }
    expect(afterX.armed).toContain("draw");
  });
});
