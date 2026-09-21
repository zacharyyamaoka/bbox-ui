import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { Block } from "../components/block";
import { InspectorPanel } from "./inspectorPanel";

/**
 * Blocks/Editor/Inspector Panel — RULING 9, 2026-09-21. Zach: *"the eye
 * visibility control for this is in the right hand inspector menu"*.
 *
 * The bench below is deliberately the WHOLE loop — the panel and a real
 * `Block` driven by one piece of state — because the failure this round is
 * written against is a control that is wired to nothing. Every assertion here
 * measures an effect on the BLOCK, never the presence of a button:
 *
 * - pressing the eye removes the description from the block's own DOM, and
 *   the card gives back exactly the height the sentence occupied;
 * - pressing it again brings the text back, character for character, which
 *   is what proves an eye HIDES rather than deletes;
 * - typing in the panel changes what the block paints.
 */
const meta = {
  title: "Blocks/Editor/Inspector Panel",
  tags: ["area:blocks", "lane:inspector-panel"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

const TEXT = "Estimates  pose from a frame.";

/** The reference host: one state, two consumers. This is the shape
 *  `apps/systemsketch/src/chrome/panels.tsx` wires to `ss-block`'s props —
 *  the panel takes values and callbacks, and knows about no engine. */
function InspectorBench({ subject = "estimate()" as string | null }) {
  const [description, setDescription] = useState(TEXT);
  const [visible, setVisible] = useState(true);
  return (
    <div data-testid="bench" style={{ display: "flex", alignItems: "flex-start", gap: 24, padding: 24 }}>
      <div data-testid="board">
        <Block header={subject ?? "—"} description={description} showDescription={visible} />
      </div>
      <div data-testid="rail" style={{ width: 260, border: "1px solid var(--color-border)", borderRadius: 12 }}>
        <InspectorPanel
          subject={subject}
          description={description}
          descriptionVisible={visible}
          onDescriptionChange={setDescription}
          onDescriptionVisibleChange={setVisible}
          testIdPrefix="inspector"
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TheEyeHidesAndRestores                                              */
/* ------------------------------------------------------------------ */

export const TheEyeHidesAndRestores: Story = {
  render: () => <InspectorBench />,
  play: async ({ canvasElement }) => {
    const bench = required<HTMLElement>(canvasElement, '[data-testid="bench"]', "the bench");
    const block = required<HTMLElement>(bench, '[data-slot="block"]', "the block");
    const eye = required<HTMLButtonElement>(bench, '[data-testid="inspector-description-eye"]', "the eye toggle");

    const description = required<HTMLElement>(block, '[data-slot="block-description"]', "the description on the block");
    await expect(description.textContent).toBe(TEXT);
    await expect(eye.getAttribute("aria-pressed")).toBe("true");

    // Measured BEFORE the press: the height the sentence occupies, and the
    // card's own hugged height.
    const sentenceHeight = description.getBoundingClientRect().height;
    const shownHeight = block.getBoundingClientRect().height;
    await expect(sentenceHeight).toBeGreaterThan(0);

    await userEvent.click(eye);

    // THE EFFECT ON THE BLOCK — not on the button.
    await waitFor(() => expect(block.querySelector('[data-slot="block-description"]')).toBeNull());
    await expect(eye.getAttribute("aria-pressed")).toBe("false");
    await expect(Math.abs(shownHeight - block.getBoundingClientRect().height - sentenceHeight)).toBeLessThanOrEqual(1);

    // HIDING IS NOT DELETING: the panel still holds the author's text, and
    // says so in words, so nobody presses the eye and loses a sentence.
    const textarea = required<HTMLTextAreaElement>(bench, '[data-testid="inspector-description-text"]', "the description field");
    await expect(textarea.value).toBe(TEXT);
    await expect(bench.querySelector('[data-slot="inspector-description-hidden-note"]')).not.toBeNull();

    // Back on, character for character.
    await userEvent.click(eye);
    const again = await waitFor(() => required<HTMLElement>(block, '[data-slot="block-description"]', "the restored description"));
    await expect(again.textContent).toBe(TEXT);
    await expect(eye.getAttribute("aria-pressed")).toBe("true");
    await expect(Math.abs(block.getBoundingClientRect().height - shownHeight)).toBeLessThanOrEqual(1);
    await expect(bench.querySelector('[data-slot="inspector-description-hidden-note"]')).toBeNull();
  },
};

/* ------------------------------------------------------------------ */
/* TypingReachesTheBlock                                               */
/* ------------------------------------------------------------------ */

export const TypingReachesTheBlock: Story = {
  render: () => <InspectorBench />,
  play: async ({ canvasElement }) => {
    const bench = required<HTMLElement>(canvasElement, '[data-testid="bench"]', "the bench");
    const block = required<HTMLElement>(bench, '[data-slot="block"]', "the block");
    const textarea = required<HTMLTextAreaElement>(bench, '[data-testid="inspector-description-text"]', "the description field");

    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Reads a frame.");

    const description = await waitFor(() => required<HTMLElement>(block, '[data-slot="block-description"]', "the description on the block"));
    await expect(description.textContent).toBe("Reads a frame.");

    // Emptying it stops the paint without touching the eye — the donor's
    // `resolved.description && data.description` gate, driven from the
    // authoring surface rather than asserted on a literal.
    await userEvent.clear(textarea);
    await waitFor(() => expect(block.querySelector('[data-slot="block-description"]')).toBeNull());
    await expect(required<HTMLButtonElement>(bench, '[data-testid="inspector-description-eye"]', "the eye").getAttribute("aria-pressed")).toBe("true");
  },
};

/* ------------------------------------------------------------------ */
/* NothingSelected                                                     */
/* ------------------------------------------------------------------ */

export const NothingSelected: Story = {
  render: () => <InspectorBench subject={null} />,
  play: async ({ canvasElement }) => {
    const bench = required<HTMLElement>(canvasElement, '[data-testid="bench"]', "the bench");
    // `panelShell.tsx`'s ported lesson: an empty selection gets copy, not a
    // blank column.
    const empty = required<HTMLElement>(bench, '[data-testid="inspector-empty"]', "the empty state");
    await expect(empty.textContent).toContain("Select a block");
    await expect(bench.querySelector('[data-testid="inspector-description-eye"]')).toBeNull();
  },
};
