// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FIGMA_DENSE } from "../src/variants/FigmaDense";
import { CURRENT } from "../src/variants/Current";
import type { Subject } from "../src/fieldModel";
import { GLYPH_FIELDS, GLYPH_PRESETS } from "@bbox-ui/core";

/**
 * Scoped to jsdom via the file-level `@vitest-environment` comment
 * (vitest's own per-file override — see `packages/glyph-picker/vitest.config.ts`
 * for the package-wide version of the same reasoning) rather than a
 * package-level `vitest.config.ts`: every OTHER test in this package is
 * pure logic, and `GlyphPicker` is a real Base UI `Popover` — even
 * mounting its closed `Popover.Trigger` needs an actual `document`, the
 * one thing `react-test-renderer` deliberately doesn't have.
 *
 * The picker stays CLOSED throughout — this is a rendering test
 * ("does the row become the picker's trigger"), not an interaction test
 * (opening/picking is `@bbox-ui/glyph-picker`'s own, already-proved
 * territory). Closed, `GlyphPicker`'s `defaultTrigger` never fetches the
 * Lucide/emoji chunks (gated on `decoded.kind === "lucide" || isOpen`,
 * both false for an empty/emoji `content`), so no library mock is needed.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function contentSubject(content: string): Subject {
  return { id: "glyph-1", props: { content } };
}

describe("the \"glyph\" field control", () => {
  it("FigmaDense renders the real GlyphPicker trigger for a glyph field", () => {
    act(() => {
      root.render(
        <FIGMA_DENSE.Panel
          componentName="Glyph"
          fields={GLYPH_FIELDS}
          presets={GLYPH_PRESETS}
          subjects={[contentSubject("emoji:🔍")]}
          onChange={vi.fn()}
          onClearOverride={vi.fn()}
        />,
      );
    });
    const trigger = container.querySelector('[data-slot="glyph-picker-trigger"]');
    expect(trigger).not.toBeNull();
    // The row's control cell IS the trigger — not a text box beside it.
    expect(container.querySelector('[data-slot="glyph-field-control"] input[type="text"]')).toBeNull();
  });

  it("FigmaDense shows the Mixed badge and an empty trigger when subjects disagree", () => {
    act(() => {
      root.render(
        <FIGMA_DENSE.Panel
          componentName="Glyph"
          fields={GLYPH_FIELDS}
          presets={GLYPH_PRESETS}
          subjects={[contentSubject("emoji:🔍"), contentSubject("lucide:rocket")]}
          onChange={vi.fn()}
          onClearOverride={vi.fn()}
        />,
      );
    });
    expect(container.querySelector('[data-slot="field-mixed-badge"]')?.textContent).toBe("mixed");
    // "empty" trigger: the default trigger's Glyph got value="", the empty
    // "add icon" affordance, per GlyphPicker's `data-empty` flag.
    expect(container.querySelector('[data-slot="glyph-picker-trigger"]')?.getAttribute("data-empty")).toBe("true");
  });

  it("every other variant (Current, over the shared FieldTraceRow) keeps the honest text fallback", () => {
    act(() => {
      root.render(
        <CURRENT.Panel
          componentName="Glyph"
          fields={GLYPH_FIELDS}
          presets={GLYPH_PRESETS}
          subjects={[contentSubject("emoji:🔍")]}
          onChange={vi.fn()}
          onClearOverride={vi.fn()}
        />,
      );
    });
    expect(container.querySelector('[data-slot="glyph-picker-trigger"]')).toBeNull();
    const contentRow = container.querySelector('[data-field="content"]');
    expect(contentRow?.querySelector('input[type="text"]')).not.toBeNull();
  });
});
