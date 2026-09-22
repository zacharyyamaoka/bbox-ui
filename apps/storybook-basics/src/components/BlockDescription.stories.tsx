import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { Block } from "./block";
import { BLOCK_DESCRIPTION_FONT_PX, BLOCK_DESCRIPTION_PADDING_X_PX } from "./blockDescription";

/**
 * Blocks/Block Description — RULING 9's paint half, 2026-09-21.
 *
 * Ported from the frozen v1 lineage rather than designed here:
 * `packages/bbox-ui/src/block.fields.ts:120-124` (the governed toggle,
 * `defaultValue: true`), `src/block.tsx:367-380` (the `<p>` itself) and
 * `src/blockFace.tsx:437-454` (immediately after the header, gated on the
 * boolean AND a non-empty string). Each story below pins one of those three.
 *
 * Every spatial claim is measured with `getBoundingClientRect` /
 * `getComputedStyle` against `blockDescription.tsx`'s OWN exported constants
 * — no number is retyped in this file.
 */
const meta = {
  title: "Components/Blocks/BlockDescription",
  tags: ["object:block", "lane:block-description"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

/** Authored with a run of spaces and a newline on purpose — the truthful
 *  rendering rule applies to a description exactly as it does to a port
 *  declaration, and `white-space: pre-wrap` is what keeps both. */
const TEXT = "Estimates  pose from a frame.\nSecond line.";

/* ------------------------------------------------------------------ */
/* UnderTheHeader — placement, size and inset, all measured.           */
/* ------------------------------------------------------------------ */

export const UnderTheHeader: Story = {
  render: () => (
    <div data-testid="bench" style={{ padding: 24 }}>
      <Block header="estimate()" description={TEXT} body="body" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const bench = required<HTMLElement>(canvasElement, '[data-testid="bench"]', "the bench");
    const block = required<HTMLElement>(bench, '[data-slot="block"]', "the block");
    const header = required<HTMLElement>(block, '[data-slot="block-header"]', "the header");
    const body = required<HTMLElement>(block, '[data-slot="block-body"]', "the body");
    const description = required<HTMLElement>(block, '[data-slot="block-description"]', "the description");

    // TRUTHFUL: every authored character survives, the double space and the
    // newline included.
    await expect(description.textContent).toBe(TEXT);

    const headerRect = header.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    const rect = description.getBoundingClientRect();

    // The donor's placement: AFTER the header, BEFORE the body, inside the
    // card. Measured, not inferred from DOM order.
    await expect(rect.top).toBeGreaterThanOrEqual(headerRect.bottom - 0.5);
    await expect(rect.bottom).toBeLessThanOrEqual(bodyRect.top + 0.5);
    await expect(rect.bottom).toBeLessThanOrEqual(blockRect.bottom + 0.5);

    // Two lines rendered as two lines — `pre-wrap` honouring the newline is
    // what makes the box taller than one line of type.
    await expect(rect.height).toBeGreaterThan(BLOCK_DESCRIPTION_FONT_PX * 2);

    // SIZE and INSET against the component's own constants.
    const styles = getComputedStyle(description);
    await expect(styles.fontSize).toBe(`${BLOCK_DESCRIPTION_FONT_PX}px`);
    await expect(styles.paddingLeft).toBe(`${BLOCK_DESCRIPTION_PADDING_X_PX}px`);
    await expect(styles.whiteSpace).toBe("pre-wrap");

    // ALIGNED WITH THE TITLE, which is the whole reason the inset constant
    // is 12: the header's own `px-3` resolves to the same number, so the
    // sentence starts under the first letter of the name rather than in a
    // gutter of its own. Measured off BOTH elements, so a change to either
    // side breaks this.
    await expect(getComputedStyle(header).paddingLeft).toBe(styles.paddingLeft);
    await expect(Math.abs(rect.left - headerRect.left)).toBeLessThanOrEqual(1);
  },
};

/* ------------------------------------------------------------------ */
/* TheEyeRemovesTheRegion — hidden is gone, not merely blank.          */
/* ------------------------------------------------------------------ */

export const TheEyeRemovesTheRegion: Story = {
  render: () => (
    <div data-testid="bench" style={{ display: "flex", gap: 24, padding: 24 }}>
      <div data-testid="shown">
        <Block header="estimate()" description={TEXT} />
      </div>
      <div data-testid="hidden">
        <Block header="estimate()" description={TEXT} showDescription={false} />
      </div>
      {/* The donor's OTHER half of the gate: the toggle is on (default), but
          there is nothing to say. `blockDescriptionIsPainted` returns false,
          so an untouched block reserves no blank line. */}
      <div data-testid="empty">
        <Block header="estimate()" description="   " />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const bench = required<HTMLElement>(canvasElement, '[data-testid="bench"]', "the bench");
    const shown = required<HTMLElement>(bench, '[data-testid="shown"] [data-slot="block"]', "the shown block");
    const hidden = required<HTMLElement>(bench, '[data-testid="hidden"] [data-slot="block"]', "the hidden block");
    const empty = required<HTMLElement>(bench, '[data-testid="empty"] [data-slot="block"]', "the empty-text block");

    const description = required<HTMLElement>(shown, '[data-slot="block-description"]', "the description");
    await expect(hidden.querySelector('[data-slot="block-description"]')).toBeNull();
    await expect(empty.querySelector('[data-slot="block-description"]')).toBeNull();

    // SPATIAL, and the reason "hidden" has to mean REMOVED rather than
    // `visibility: hidden`: a card with no explicit height hugs what it
    // renders (block.tsx's own size contract), so hiding the description has
    // to give the height back. Measured as the difference between two live
    // cards that differ in nothing else.
    const shownRect = shown.getBoundingClientRect();
    const hiddenRect = hidden.getBoundingClientRect();
    const descriptionHeight = description.getBoundingClientRect().height;
    await expect(descriptionHeight).toBeGreaterThan(0);
    await expect(Math.abs(shownRect.height - hiddenRect.height - descriptionHeight)).toBeLessThanOrEqual(1);

    // And the empty-string case collapses to exactly the hidden case — the
    // two "nothing to paint" reasons produce one identical card.
    await expect(Math.abs(empty.getBoundingClientRect().height - hiddenRect.height)).toBeLessThanOrEqual(1);
  },
};
