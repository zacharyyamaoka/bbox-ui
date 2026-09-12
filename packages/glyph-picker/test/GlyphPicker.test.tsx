import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { GlyphPicker } from "../src/GlyphPicker";
import { resolveLucideName } from "../src/resolveLucideName";

// React 19's test renderer only flushes its render synchronously inside
// `act()`; without this flag it warns "not configured to support act()"
// even though `act()` is exactly what every render below already uses.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderPicker(el: React.ReactElement): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(el);
  });
  return renderer;
}

/**
 * This package is a SKELETON (docs/GLYPH-PLAN.md phase 3 fills in the real
 * picker) — these tests pin the FROZEN INTERFACE's observable behaviour,
 * not any real icon/emoji/upload UI, which does not exist yet.
 */
describe("GlyphPicker (skeleton)", () => {
  it("renders a trigger button wrapping a Glyph painted with `value`, closed by default", () => {
    const renderer = renderPicker(<GlyphPicker value="lucide:rocket" onChange={vi.fn()} />);
    const trigger = renderer.root.findByProps({ "data-slot": "glyph-picker-trigger" });
    expect(trigger.props["aria-expanded"]).toBe(false);
    const glyph = renderer.root.findByProps({ "data-slot": "glyph" });
    expect(glyph.props["data-content-kind"]).toBe("lucide");
    expect(() => renderer.root.findByProps({ "data-slot": "glyph-picker-panel" })).toThrow();
    act(() => renderer.unmount());
  });

  it("a click opens the placeholder panel (uncontrolled)", () => {
    const renderer = renderPicker(<GlyphPicker value="" onChange={vi.fn()} />);
    act(() => {
      renderer.root.findByProps({ "data-slot": "glyph-picker-trigger" }).props.onClick();
    });
    const panel = renderer.root.findByProps({ "data-slot": "glyph-picker-panel" });
    expect(panel.props.role).toBe("dialog");
    expect(panel.props["aria-label"]).toBe("Glyph picker");
    act(() => renderer.unmount());
  });

  it("a custom trigger (children) replaces the default Glyph trigger", () => {
    const renderer = renderPicker(
      <GlyphPicker value="" onChange={vi.fn()}>
        <span data-slot="my-custom-trigger" />
      </GlyphPicker>,
    );
    expect(() => renderer.root.findByProps({ "data-slot": "glyph" })).toThrow();
    renderer.root.findByProps({ "data-slot": "my-custom-trigger" });
    act(() => renderer.unmount());
  });

  it("open/onOpenChange controlled mode: an external open=false keeps the panel closed even after a click", () => {
    const onOpenChange = vi.fn();
    const renderer = renderPicker(
      <GlyphPicker value="" onChange={vi.fn()} open={false} onOpenChange={onOpenChange} />,
    );
    act(() => {
      renderer.root.findByProps({ "data-slot": "glyph-picker-trigger" }).props.onClick();
    });
    // Controlled: the picker itself never flips its own state — it only
    // reports the intent and waits for the host to pass a new `open`.
    expect(() => renderer.root.findByProps({ "data-slot": "glyph-picker-panel" })).toThrow();
    expect(onOpenChange).toHaveBeenCalledWith(true);
    act(() => renderer.unmount());
  });

  it("disabled disables the trigger", () => {
    const renderer = renderPicker(<GlyphPicker value="" onChange={vi.fn()} disabled />);
    const trigger = renderer.root.findByProps({ "data-slot": "glyph-picker-trigger" });
    expect(trigger.props.disabled).toBe(true);
    act(() => renderer.unmount());
  });
});

describe("resolveLucideName (skeleton)", () => {
  it("returns null for every name — phase 3 replaces this with a real lookup", () => {
    expect(resolveLucideName("rocket")).toBeNull();
    expect(resolveLucideName("circle-check-big")).toBeNull();
  });
});
