import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { Glyph } from "@bbox-ui/core";
import { LucideGlyphResolver, resolveLucideName } from "../src/resolveLucideName";

/**
 * `react-test-renderer`, not the jsdom+`react-dom` harness `GlyphPicker.
 * test.tsx` uses for the Popover — deliberately: `LucideGlyphResolver`
 * wraps `Glyph`, a plain `<span>`, in nothing but a context provider and
 * an effect that kicks off the lazy JSON `import()`. None of that touches
 * a portal or floating-ui positioning, so there's nothing here that needs
 * a real DOM — the smaller, DOM-free renderer is the correct tool for
 * exactly this one test, matching the frozen skeleton's own choice before
 * a real Popover existed to complicate it.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderTree(el: React.ReactElement): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(el);
  });
  return renderer;
}

/** Polls a react-test-renderer assertion until it stops throwing, or fails after `timeoutMs`. */
async function waitForNode<T>(assertion: () => T, timeoutMs = 15000): Promise<T> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return assertion();
    } catch (error) {
      if (Date.now() - start > timeoutMs) throw error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
      });
    }
  }
}

describe("resolveLucideName", () => {
  it("returns null for a name nothing has loaded yet", () => {
    // WHY this assertion is safe even though other test files in this
    // package load the real chunk: `peekLucideLibrary`'s module-level
    // cache is per test FILE (each vitest test file gets its own module
    // graph), never shared across files.
    expect(resolveLucideName("a-name-nobody-has-loaded")).toBeNull();
  });
});

describe("LucideGlyphResolver + Glyph", () => {
  it("renders the empty, unresolved slot before the chunk loads, then a real svg once it does", async () => {
    const renderer = renderTree(
      <LucideGlyphResolver>
        <Glyph content="lucide:rocket" />
      </LucideGlyphResolver>,
    );

    const before = renderer.root.findByProps({ "data-slot": "glyph" });
    expect(before.props["data-content-kind"]).toBe("lucide");
    expect(before.props["data-unresolved"]).toBe("rocket");
    expect(() => before.findByType("svg")).toThrow();

    // Flushes the effect's `loadLucideLibrary()` (a real dynamic import of
    // the local JSON file) and the re-render it triggers — polled rather
    // than a single fixed tick, since a cold import of the ~636KB chunk
    // can take longer than one microtask turn under vitest's transform.
    const after = await waitForNode(() => {
      const node = renderer.root.findByProps({ "data-slot": "glyph" });
      if (node.props["data-unresolved"] !== undefined) throw new Error("not resolved yet");
      return node;
    });
    const svg = after.findByType("svg");
    expect(svg).toBeDefined();

    act(() => renderer.unmount());
  });
});
