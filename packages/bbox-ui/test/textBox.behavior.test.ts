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
  it("single (default) gets nowrap/ellipsis and a truthful title carrying the full text", () => {
    const el = textBoxElement({ children: "hello world" });
    expect(el.props["data-lines"]).toBe("single");
    expect(el.props.style.whiteSpace).toBe("nowrap");
    expect(el.props.style.overflow).toBe("hidden");
    expect(el.props.style.textOverflow).toBe("ellipsis");
    expect(el.props.title).toBe("hello world");
  });

  it("multi gets pre-wrap/overflow-wrap and NO title", () => {
    const el = textBoxElement({ lines: "multi", children: "hello\nworld" });
    expect(el.props["data-lines"]).toBe("multi");
    expect(el.props.style.whiteSpace).toBe("pre-wrap");
    expect(el.props.style.overflowWrap).toBe("anywhere");
    expect(el.props.title).toBeUndefined();
  });

  it("single with non-string children gets no title (nothing truthful to show)", () => {
    const el = textBoxElement({ children: 42 });
    expect(el.props.title).toBeUndefined();
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

  it("editing + NON-string children is ignored — renders rest, not the control", () => {
    const el = textBoxElement({ editing: true, children: 42 });
    expect(el.props["data-editing"]).toBe(true);
    expect(el.props.children).toBe(42);
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
  it("empty text (omitted children) at rest paints the placeholder, muted, with data-placeholder", () => {
    const el = textBoxElement({ placeholder: "Type something" });
    expect(el.props.children.props["data-placeholder"]).toBe("");
    expect(el.props.children.props.children).toBe("Type something");
  });

  it("empty STRING children (\"\") also counts as empty", () => {
    const el = textBoxElement({ children: "", placeholder: "Type something" });
    expect(el.props.children.props["data-placeholder"]).toBe("");
  });

  it("non-empty text never shows the placeholder", () => {
    const el = textBoxElement({ children: "real text", placeholder: "Type something" });
    expect(el.props.children).toBe("real text");
  });

  it("no placeholder configured renders truly empty, not a phantom node", () => {
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
