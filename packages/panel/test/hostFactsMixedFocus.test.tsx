// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HOST_FIELDS } from "../src/hostFields";
import { HostFactsSection } from "../src/HostFactsSection";
import type { Subject } from "../src/fieldModel";

/**
 * Real-DOM regression for the audit's round-2 finding: HostFactsSection used
 * to render `<MixedNumberBox>` while a row disagreed and `<NumberInput>` once
 * it didn't — two different component TYPES on the same row, so React
 * unmounted one and mounted the other the instant a keystroke made the
 * selection agree, dropping focus and every keystroke after the first
 * ("typing 42 into a Mixed x landed 4"). `react-test-renderer` cannot see
 * this — it has no `document.activeElement` — so this file mounts the real
 * thing with `react-dom` the way `glyphFieldControl.test.tsx` already does.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function subject(id: string, x: number): Subject {
  return { id, props: { x, y: 0, rotation: 0, w: 18, h: 18 } };
}

/** Mirrors how a real host applies a HostFactsSection commit: write the
 *  field to every currently-selected subject, the same shape the create
 *  page's own selection reducer will use. */
function Harness() {
  const [subjects, setSubjects] = useState<Subject[]>([subject("a", 10), subject("b", 200)]);
  return (
    <HostFactsSection
      renderLabel="tldraw"
      fields={HOST_FIELDS}
      subjects={subjects}
      editable
      onChange={(fieldId, value) =>
        setSubjects((prev) => prev.map((s) => ({ ...s, props: { ...s.props, [fieldId]: value } })))
      }
    />
  );
}

async function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("HostFactsSection: Mixed row keeps its DOM node and focus across the mixed → agree transition", () => {
  it("typing \"42\" into a Mixed x box lands 42, not 4", async () => {
    act(() => {
      root.render(<Harness />);
    });
    const input = () =>
      container.querySelector('[data-field="x"] [data-slot="host-fact-input"]') as HTMLInputElement;

    expect(input().value).toBe(""); // Mixed (10 vs 200): nothing to show
    act(() => {
      input().focus(); // fires NumberInput's onFocus, a React state update
    });
    expect(document.activeElement).toBe(input());

    // First keystroke: both subjects disagreed with "4", so committing it
    // to both is exactly the moment the selection stops being Mixed — the
    // instant the old two-component design remounted.
    await typeInto(input(), "4");
    const nodeAfterFirstKeystroke = input();
    expect(nodeAfterFirstKeystroke).not.toBeNull();
    expect(document.activeElement).toBe(nodeAfterFirstKeystroke); // no remount, focus survived

    // Second keystroke completes "42" on the SAME node.
    await typeInto(nodeAfterFirstKeystroke, "42");
    expect(input().value).toBe("42");
    expect(document.activeElement).toBe(input());
  });
});
