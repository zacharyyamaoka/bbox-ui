// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import type { FieldSpec } from "@bbox-ui/schema";
import { FIGMA_DENSE } from "../src/variants/FigmaDense";
import { ICON_STRIP } from "../src/variants/IconStrip";
import { NumberInput } from "../src/NumberInput";

/**
 * The Mixed-gesture guards, rendered. Round 7 mutation-tested the suite and
 * three guards survived deletion with everything green: the scrub's Mixed
 * check, Icon Strip's ± guard, and the arrow-key preventDefault. The defect
 * they guard was found twice (rounds 5 and 6): a nudge on a Mixed selection
 * wrote default+step over every instance, no undo. These drive the real
 * components so a third return goes red.
 */
const PADDING: FieldSpec = { id: "padding", label: "Padding", kind: "number", defaultValue: 0, min: 0, max: 24, step: 1 };

// jsdom has no pointer capture; the scrub calls it on pointerdown.
beforeAllPointerCapture();
function beforeAllPointerCapture() {
  const proto = (globalThis as unknown as { Element?: { prototype: Record<string, unknown> } }).Element?.prototype;
  if (proto && !proto.setPointerCapture) {
    proto.setPointerCapture = () => {};
    proto.releasePointerCapture = () => {};
  }
}

function panelProps(subjects: { id: string; props: Record<string, unknown> }[], onChange = vi.fn()) {
  return {
    componentName: "Glyph",
    fields: [PADDING],
    presets: [],
    subjects,
    onChange,
    onClearOverride: vi.fn(),
  };
}

describe("Figma Dense label scrub", () => {
  function scrub(ui: ReturnType<typeof render>, dx: number) {
    const label = ui.container.querySelector('[data-field="padding"] [data-slot="field-label"]') as HTMLElement;
    act(() => { fireEvent.pointerDown(label, { clientX: 100, pointerId: 1 }); });
    act(() => { fireEvent.pointerMove(label, { clientX: 100 + dx, pointerId: 1 }); });
    act(() => { fireEvent.pointerUp(label, { clientX: 100 + dx, pointerId: 1 }); });
  }
  it("does not start on a Mixed row (kills 'drop the Mixed guard')", () => {
    const onChange = vi.fn();
    const ui = render(<FIGMA_DENSE.Panel {...panelProps([{ id: "a", props: { padding: 18 } }, { id: "b", props: { padding: 6 } }], onChange)} />);
    // Expert tier so the number row is on screen regardless of the stored tier.
    const expert = ui.container.querySelector('[data-slot="tier-button"][data-tier="expert"]') as HTMLElement;
    act(() => { fireEvent.click(expert); });
    scrub(ui, 24);
    expect(onChange).not.toHaveBeenCalled();
  });
  it("still scrubs a single row from its resolved value", () => {
    const onChange = vi.fn();
    const ui = render(<FIGMA_DENSE.Panel {...panelProps([{ id: "a", props: { padding: 10 } }], onChange)} />);
    const expert = ui.container.querySelector('[data-slot="tier-button"][data-tier="expert"]') as HTMLElement;
    act(() => { fireEvent.click(expert); });
    scrub(ui, 24);
    expect(onChange).toHaveBeenCalledWith("padding", 16);
  });
});

describe("Icon Strip ± on a Mixed selection", () => {
  it("the arrows are disabled and a click writes nothing (kills 'drop the ± guard')", () => {
    const onChange = vi.fn();
    const ui = render(<ICON_STRIP.Panel {...panelProps([{ id: "a", props: { padding: 18 } }, { id: "b", props: { padding: 6 } }], onChange)} />);
    const plus = ui.container.querySelector('button[aria-label^="Increase"]') as HTMLButtonElement;
    expect(plus).not.toBeNull();
    expect(plus.disabled).toBe(true);
    act(() => { fireEvent.click(plus); });
    expect(onChange).not.toHaveBeenCalled();
  });
  it("still nudges a single row", () => {
    const onChange = vi.fn();
    const ui = render(<ICON_STRIP.Panel {...panelProps([{ id: "a", props: { padding: 10 } }], onChange)} />);
    const plus = ui.container.querySelector('button[aria-label^="Increase"]') as HTMLButtonElement;
    act(() => { fireEvent.click(plus); });
    expect(onChange).toHaveBeenCalledWith("padding", 11);
  });
});

describe("the keyboard spinner on a Mixed box", () => {
  it("ArrowUp is prevented while the box shows nothing (kills 'drop the preventDefault')", () => {
    const onCommit = vi.fn();
    const ui = render(<NumberInput data-slot="box" value={undefined} defaultValue={0} min={0} max={24} step={1} onCommit={onCommit} />);
    const box = ui.container.querySelector('[data-slot="box"]') as HTMLInputElement;
    act(() => { fireEvent.focus(box); });
    const ev = new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true });
    act(() => { box.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
