import { describe, expect, it } from "vitest";
import { TextBox } from "../src/textBox";

/**
 * `TextBox` itself calls no hooks — only its internal `TextBoxControl` does
 * (useRef/useEffect/useState, for autofocus/selection/the focus ring) — so
 * calling `TextBox(props)` directly, as a plain function, is still safe
 * outside a real React render (`textBox.fields.test.ts`'s own established
 * technique). `TextBoxControl` itself is deliberately NOT invoked this way
 * anywhere below — doing so would throw ("Invalid hook call") outside
 * React's own dispatcher; its behavior is proved by the real-browser CDP
 * journey (docs/TEXTBOX-EDITING-SPEC.md §4), not a unit test.
 */
function textBoxElement(props: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (TextBox as any)(props);
}

describe("TextBox — lines (rest)", () => {
  // WHY these assert on `el.props.children` (the inner `text-box-content`
  // span) rather than `el.props.style` (the root): verify-round-2 F1 —
  // the ROOT is `inline-flex`, and CSS `text-overflow` never applies to a
  // flex container (only a block one), so pinning the style object on the
  // flex root proved nothing about what actually painted — measured in a
  // real browser, that shape hard-clipped text at BOTH ends with NO
  // ellipsis glyph, style object notwithstanding. The recipe now lives on
  // a real block-level child; see textBox.tsx's own WHY comment and
  // docs/TEXTBOX-EDITING-SPEC.md §4's `assertTruthfulTruncation` journey
  // step, which proves the actual paint in Chromium (this file cannot).
  it("single (default) gets nowrap/ellipsis on a BLOCK content wrapper, a shrinkable flex item, and a truthful title carrying the full text", () => {
    const el = textBoxElement({ children: "hello world" });
    expect(el.props["data-lines"]).toBe("single");
    const wrapper = el.props.children;
    expect(wrapper.props["data-slot"]).toBe("text-box-content");
    expect(wrapper.props.style.display).toBe("block");
    expect(wrapper.props.style.whiteSpace).toBe("nowrap");
    expect(wrapper.props.style.overflow).toBe("hidden");
    expect(wrapper.props.style.textOverflow).toBe("ellipsis");
    // The flex item must be allowed to shrink BELOW its content's intrinsic
    // width — the default `min-width: auto` on a flex item is the other
    // half of F1: without overriding it to 0, the box never gets narrow
    // enough for `overflow: hidden` to have anything to clip.
    expect(wrapper.props.style.minWidth).toBe(0);
    expect(wrapper.props.style.maxWidth).toBe("100%");
    expect(wrapper.props.children).toBe("hello world");
    expect(el.props.title).toBe("hello world");
  });

  // WHY this is its OWN test, separate from the content wrapper's own
  // `minWidth: 0` above: this is the OTHER half of verify-round-2's F1
  // sweep, found only by driving the REAL app (not a unit test) — the
  // ROOT is itself a flex/grid item wherever a host nests it (a Block
  // header slot's `Flex`, live in `apps/docs`), and without ITS OWN
  // `min-width: 0`, the root refused to shrink below its own text's width
  // at all: measured live, a Header · left slot correctly held to 107px
  // by a real Block's header grid, yet the TextBox ROOT still rendered at
  // 534px — silently overflowing its own 107px parent (which has
  // `overflow: visible`), so the inner wrapper's ellipsis fix never had a
  // box narrow enough to engage. `className`'s `w-fit` sets `width:
  // fit-content` but never touches `min-width`, so nothing else in this
  // component was going to make this box willing to shrink below its own
  // content on its host's behalf.
  it("the ROOT itself gets minWidth: 0 — so a host that squeezes this box (a Block header slot's Flex) can actually shrink it below its own text's width", () => {
    const el = textBoxElement({ children: "hello world" });
    expect(el.props.style.minWidth).toBe(0);
  });

  it("the ROOT's own style never carries the lines recipe — it lives only on the block content wrapper", () => {
    const el = textBoxElement({ children: "hello world" });
    expect(el.props.style.whiteSpace).toBeUndefined();
    expect(el.props.style.overflow).toBeUndefined();
    expect(el.props.style.textOverflow).toBeUndefined();
    expect(el.props.style.overflowWrap).toBeUndefined();
  });

  it("multi gets pre-wrap/overflow-wrap and NO title", () => {
    const el = textBoxElement({ lines: "multi", children: "hello\nworld" });
    expect(el.props["data-lines"]).toBe("multi");
    const wrapper = el.props.children;
    expect(wrapper.props["data-slot"]).toBe("text-box-content");
    expect(wrapper.props.style.display).toBe("block");
    expect(wrapper.props.style.whiteSpace).toBe("pre-wrap");
    expect(wrapper.props.style.overflowWrap).toBe("anywhere");
    expect(wrapper.props.style.minWidth).toBe(0);
    expect(el.props.title).toBeUndefined();
  });

  it("single with non-string children gets no title (nothing truthful to show), but is still wrapped in the content block", () => {
    const el = textBoxElement({ children: 42 });
    expect(el.props.title).toBeUndefined();
    expect(el.props.children.props["data-slot"]).toBe("text-box-content");
    expect(el.props.children.props.children).toBe(42);
  });

  // WHY its own test, not folded into the placeholder describe block below:
  // an empty STRING is still `typeof children === "string"`, so without an
  // explicit `children !== ""` check `title` got set to `""` — a real (if
  // invisible) attribute, a false "there is truthfully nothing more to see
  // here" for a box that in fact has no text at all, not the same as no
  // `title` attribute.
  it("single with EMPTY string children gets no title, not title=\"\"", () => {
    expect(textBoxElement({ children: "" }).props.title).toBeUndefined();
    expect(textBoxElement({ children: "", placeholder: "Type something" }).props.title).toBeUndefined();
  });
});

describe("TextBox — editing", () => {
  it("editing + string children swaps the resting text for the control, and sets data-editing", () => {
    const el = textBoxElement({ editing: true, children: "hi" });
    expect(el.props["data-editing"]).toBe(true);
    expect(el.props.children.type.name).toBe("TextBoxControl");
    expect(el.props.children.props.value).toBe("hi");
    expect(el.props.children.props.lines).toBe("single");
  });

  it("editing + NON-string children is ignored — renders rest (the content wrapper), not the control", () => {
    const el = textBoxElement({ editing: true, children: 42 });
    expect(el.props["data-editing"]).toBe(true);
    expect(el.props.children.props["data-slot"]).toBe("text-box-content");
    expect(el.props.children.props.children).toBe(42);
  });

  it("data-editing reflects the literal prop even when editing is a no-op", () => {
    expect(textBoxElement({ editing: false }).props["data-editing"]).toBe(false);
    expect(textBoxElement({ editing: true, children: 42 }).props["data-editing"]).toBe(true);
  });

  it("readOnly reaches the control as a prop (the host may still request editing)", () => {
    const el = textBoxElement({ editing: true, children: "hi", readOnly: true });
    expect(el.props.children.props.readOnly).toBe(true);
  });

  it("the rest box keeps its nowrap/ellipsis styling out of the editing style object", () => {
    // WHY: the CONTROL renders itself (an <input>/<textarea>), so the ROOT
    // box's own overflow/ellipsis rules are irrelevant to it — applying them
    // while editing risks clipping the control's own focus ring.
    const el = textBoxElement({ editing: true, children: "hi" });
    expect(el.props.style.whiteSpace).toBeUndefined();
    expect(el.props.style.overflow).toBeUndefined();
    expect(el.props.style.textOverflow).toBeUndefined();
  });
});

describe("TextBox — placeholder", () => {
  // WHY these now read through `el.props.children.props.children` (one
  // level deeper than before verify-round-2's F1 fix): the placeholder
  // span is no longer the root's direct child — it sits inside the new
  // `text-box-content` block wrapper, alongside real text, so the SAME
  // truncation recipe applies to a long placeholder too.
  it("empty text (omitted children) at rest paints the placeholder, muted, with data-placeholder", () => {
    const el = textBoxElement({ placeholder: "Type something" });
    expect(el.props.children.props["data-slot"]).toBe("text-box-content");
    const placeholderEl = el.props.children.props.children;
    expect(placeholderEl.props["data-placeholder"]).toBe("");
    expect(placeholderEl.props.children).toBe("Type something");
  });

  it("empty STRING children (\"\") also counts as empty", () => {
    const el = textBoxElement({ children: "", placeholder: "Type something" });
    expect(el.props.children.props.children.props["data-placeholder"]).toBe("");
  });

  it("non-empty text never shows the placeholder", () => {
    const el = textBoxElement({ children: "real text", placeholder: "Type something" });
    expect(el.props.children.props["data-slot"]).toBe("text-box-content");
    expect(el.props.children.props.children).toBe("real text");
  });

  it("no placeholder configured renders truly empty, not a phantom node — not even the content wrapper", () => {
    const el = textBoxElement({});
    expect(el.props.children).toBeUndefined();
  });
});

describe("TextBox — size/sizePx (custom rung)", () => {
  it('size="custom" uses sizePx for fontSize', () => {
    expect(textBoxElement({ size: "custom", sizePx: 51 }).props.style.fontSize).toBe(51);
  });

  it("a named rung ignores sizePx entirely", () => {
    expect(textBoxElement({ size: "md", sizePx: 999 }).props.style.fontSize).toBe(24);
  });

  it("size=\"custom\" with no sizePx falls back to the real prop default (24)", () => {
    expect(textBoxElement({ size: "custom" }).props.style.fontSize).toBe(24);
  });
});
