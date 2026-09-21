// src/shapes/registry.test.ts — the pure half of the tool-UI fold.
//
// The end-to-end half (B really does arm the Block and really does not arm
// the pencil, in a live editor) is src/shortcuts.smoke.test.tsx. This file
// pins the edges that a browser journey cannot show you cheaply: what
// `releaseShortcut` does to a `kbd` string it is handed.
import { describe, expect, it } from "vitest";

import { releaseShortcut, withToolUi } from "./registry";
import { BLOCK_TOOL_ID } from "./types";

/** tldraw 5.3.2's own draw entry, `kbd` verbatim
 *  (`lib/ui/hooks/useTools.mjs:71-79`). */
const DRAW = { id: "draw", label: "tool.draw", icon: "tool-pencil", kbd: "d,b,x", onSelect: () => {} };

describe("releaseShortcut", () => {
  it("removes exactly one chord and leaves the tool's others intact", () => {
    expect(releaseShortcut({ draw: DRAW } as never, "draw", "b").draw.kbd).toBe("d,x");
    // Case-insensitive, and whitespace-tolerant the way tldraw's own `getKeys`
    // is (it strips whitespace before splitting on ",").
    expect(releaseShortcut({ draw: { ...DRAW, kbd: "d, B ,x" } } as never, "draw", "b").draw.kbd).toBe("d,x");
    // Only the whole chord matches: releasing "b" must not touch "shift+b".
    expect(releaseShortcut({ draw: { ...DRAW, kbd: "shift+b,x" } } as never, "draw", "b").draw.kbd).toBe("shift+b,x");
  });

  it("is a no-op BY IDENTITY when there is nothing to release", () => {
    const tools = { draw: DRAW } as never;
    // WHY identity and not just equality: `useKeyboardShortcuts` lists `tools`
    // in its `useEffect` deps, so returning a fresh object for a release that
    // changed nothing would tear down and re-register every keyboard shortcut
    // in the app on each render of the overrides chain.
    expect(releaseShortcut(tools, "draw", "q")).toBe(tools);
    expect(releaseShortcut(tools, "nonexistent", "b")).toBe(tools);
    expect(releaseShortcut({ draw: { ...DRAW, kbd: "" } } as never, "draw", "b")).toEqual({
      draw: { ...DRAW, kbd: "" },
    });
  });

  it("empties the kbd rather than leaving a stray separator when the last chord goes", () => {
    // tldraw skips a falsy `kbd` outright, and `parseKbd("")` yields no
    // registrations either way — but ",x" would register a real chord.
    expect(releaseShortcut({ draw: { ...DRAW, kbd: "b" } } as never, "draw", "b").draw.kbd).toBe("");
  });
});

describe("withToolUi", () => {
  it("leaves exactly one tool holding `b` — the Block", () => {
    const editor = { setCurrentTool: () => {} } as never;
    const folded = withToolUi(editor, { draw: DRAW } as never);
    const holdersOfB = Object.values(folded)
      .filter((tool) => (tool.kbd ?? "").split(",").some((chord) => chord.trim().toLowerCase() === "b"))
      .map((tool) => tool.id);
    // Zach, 2026-09-21: "Yes, please unbind B from pencil". tldraw's
    // dispatcher fires EVERY tool whose kbd matches, so "one holder" is the
    // only shape of this contract that means "one tool arms".
    expect(holdersOfB).toEqual([BLOCK_TOOL_ID]);
    expect(folded.draw.kbd).toBe("d,x");
  });
});
