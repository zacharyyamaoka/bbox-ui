import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { Block } from "../../components/block";
import { GlyphPicker } from "./glyphPicker";

/**
 * Editor/GlyphPicker — P-036 / P-043, 2026-09-21.
 *
 * Zach specified this one by pointing: *"copied from Notion almost exactly"*,
 * and *"We want a much Larger library … Right now its a bit to limited … I
 * like how it is in notion with the search bar to filter"*. His standing rule
 * for a reference app is zero-relearning, so the tabs, the filter row, the
 * shuffle die, Remove and the Recent strip are cloned rather than re-invented.
 *
 * The bench is the whole loop — the picker and a real `Block` driven by ONE
 * piece of state — for the same reason the Inspector Panel's bench is: the
 * failure this wave exists to correct is a control wired to nothing. So the
 * play functions measure what the BLOCK shows, never that a button rendered.
 *
 * What this story canNOT prove, said plainly so nobody reads more into a
 * green tick than it carries: this is a DOM bench, not the whiteboard. That
 * the same picker opens from a block on a tldraw canvas — the part P-043 is
 * actually about — is proved in the app, against the running editor, by
 * `apps/systemsketch/src/glyph.smoke.test.tsx`.
 */
const meta = {
  title: "Editor/GlyphPicker",
  tags: ["object:text-marks", "lane:glyph-picker"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

/** One state, two consumers — the shape a host wires (the whiteboard's is
 *  `apps/systemsketch/src/shapes/block/BlockFace.tsx`). */
function PickerBench({ initial = "" }: { initial?: string }) {
  const [glyph, setGlyph] = useState(initial);
  return (
    <div data-testid="bench" style={{ display: "flex", alignItems: "flex-start", gap: 24, padding: 24 }}>
      <div data-testid="board">
        <Block
          header={
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <GlyphPicker value={glyph} onChange={setGlyph} sizePreset="sm" data-testid="board-trigger" />
              <span>estimate()</span>
            </span>
          }
        />
      </div>
      {/* The second trigger, standing in for the inspector's Icon row. Two
          doors, ONE picker — P-043's whole content, and the reason this bench
          renders the component twice rather than once. */}
      <div data-testid="rail" style={{ width: 200, padding: 12, border: "1px solid var(--color-border)", borderRadius: 12 }}>
        <GlyphPicker value={glyph} onChange={setGlyph} sizePreset="md" padding={4} data-testid="rail-trigger" />
      </div>
    </div>
  );
}

/** The panel Base UI portals to `document.body` — outside the story canvas. */
const panel = () => document.querySelector<HTMLElement>('[data-slot="glyph-picker-panel"]');
const panels = () => document.querySelectorAll('[data-slot="glyph-picker-panel"]');

async function pick(kebab: string) {
  const open = await waitFor(() => {
    const found = panel();
    if (!found) throw new Error("the picker panel");
    return found;
  });
  const filter = required<HTMLInputElement>(open, '[data-testid="glyph-picker-filter"]', "the filter bar");
  await userEvent.clear(filter);
  await userEvent.type(filter, kebab);
  const cell = await waitFor(() => required<HTMLElement>(open, `[data-testid="glyph-picker-cell-lucide-${kebab}"]`, `the ${kebab} cell`));
  await userEvent.click(cell);
}

/**
 * The library is the point of P-036 — 1,818 icons, searched through Lucide's
 * own tag index, not a hand-picked shortlist. So this story filters by a TAG
 * rather than by a name: "container" is a tag on `box`, never a substring of
 * it, so the cell can only appear if the real index loaded and was searched.
 */
export const PickAnIcon: Story = {
  render: () => <PickerBench />,
  play: async ({ canvasElement }) => {
    const trigger = required<HTMLElement>(canvasElement, '[data-testid="board-trigger"]', "the board trigger");
    expect(trigger.getAttribute("data-empty")).toBe("true");
    await userEvent.click(trigger);

    const open = await waitFor(() => {
      const found = panel();
      if (!found) throw new Error("the picker panel");
      return found;
    });
    // P-036's menu, enumerated.
    for (const id of ["glyph-picker-tab-emoji", "glyph-picker-tab-icons", "glyph-picker-tab-upload", "glyph-picker-filter", "glyph-picker-shuffle", "glyph-picker-remove"]) {
      required(open, `[data-testid="${id}"]`, id);
    }

    // Search by TAG, not by name — see this story's own doc.
    const filter = required<HTMLInputElement>(open, '[data-testid="glyph-picker-filter"]', "the filter bar");
    await userEvent.type(filter, "container");
    const cell = await waitFor(() => required<HTMLElement>(open, '[data-testid="glyph-picker-cell-lucide-box"]', "the box cell"));
    await userEvent.click(cell);

    // The BLOCK changed, and the picker closed behind the pick.
    const slot = await waitFor(() => required<HTMLElement>(canvasElement, '[data-testid="board-trigger"] [data-slot="glyph"]', "the glyph slot"));
    expect(slot.getAttribute("data-content-kind")).toBe("lucide");
    await waitFor(() => expect(slot.querySelector("svg")).not.toBeNull());
    await waitFor(() => expect(panels().length).toBe(0));
  },
};

/** Remove is Notion's, and it is not the same thing as picking nothing: it
 *  clears an icon that is already there and closes. */
export const RemoveClearsIt: Story = {
  render: () => <PickerBench initial="lucide:rocket" />,
  play: async ({ canvasElement }) => {
    const trigger = required<HTMLElement>(canvasElement, '[data-testid="board-trigger"]', "the board trigger");
    expect(trigger.getAttribute("data-empty")).toBeNull();
    await userEvent.click(trigger);
    const open = await waitFor(() => {
      const found = panel();
      if (!found) throw new Error("the picker panel");
      return found;
    });
    await userEvent.click(required<HTMLElement>(open, '[data-testid="glyph-picker-remove"]', "Remove"));
    await waitFor(() => expect(required<HTMLElement>(canvasElement, '[data-testid="board-trigger"]', "the board trigger").getAttribute("data-empty")).toBe("true"));
  },
};

/**
 * P-043 in the smallest form a DOM bench can state it: two triggers, one
 * picker, one value. Never two panels open, and a pick made at the rail
 * repaints the board.
 */
export const OnePickerEveryTrigger: Story = {
  render: () => <PickerBench />,
  play: async ({ canvasElement }) => {
    await userEvent.click(required<HTMLElement>(canvasElement, '[data-testid="board-trigger"]', "the board trigger"));
    const first = await waitFor(() => {
      const found = panel();
      if (!found) throw new Error("the picker panel");
      return found;
    });
    expect(first.getAttribute("aria-label")).toBe("Glyph picker");
    expect(panels().length).toBe(1);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(panels().length).toBe(0));

    await userEvent.click(required<HTMLElement>(canvasElement, '[data-testid="rail-trigger"]', "the rail trigger"));
    const second = await waitFor(() => {
      const found = panel();
      if (!found) throw new Error("the picker panel");
      return found;
    });
    expect(second.getAttribute("aria-label")).toBe("Glyph picker");
    expect(second.className).toBe(first.className);
    expect(panels().length).toBe(1);

    await pick("anchor");
    // One value: the pick made at the RAIL is what the BOARD now paints.
    const slot = await waitFor(() => required<HTMLElement>(canvasElement, '[data-testid="board-trigger"] [data-slot="glyph"]', "the glyph slot"));
    expect(slot.getAttribute("data-content-kind")).toBe("lucide");
  },
};
