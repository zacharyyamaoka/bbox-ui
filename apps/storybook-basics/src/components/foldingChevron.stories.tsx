import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { FoldingChevron } from "./foldingChevron";

/**
 * `FoldingChevron` (foldingChevron.tsx), colocated. The component's whole
 * job is SPATIAL — "folded reads as ▶, open rotates 90° to read as ▼" — and
 * its second job (`reveal`) is a visibility state that must not move its
 * neighbours. So every assertion below is a MEASUREMENT of the rendered
 * glyph (`getBoundingClientRect`, `getComputedStyle`), never a read of the
 * `open` prop echoed back as `aria-expanded`.
 *
 * WHY this file exists beside src/components/Collapsible.stories.tsx rather
 * than extending it: that page demos the chevron WIRED to a real
 * `Collapsible` (does clicking it hide a panel?). This one is the component
 * on its own — does the glyph actually rotate, and does `reveal` change
 * anything but opacity? Different questions, so the title is nested under
 * the same folder rather than colliding with it.
 */

const meta = {
  title: "Components/Blocks/FoldingChevron/Rotation & Reveal",
  tags: ["object:block", "lane:baseline"],
  component: FoldingChevron,
  args: { open: true, onClick: () => {} },
} satisfies Meta<typeof FoldingChevron>;

export default meta;
type Story = StoryObj<typeof meta>;

function requireEl<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${selector}`);
  return found;
}

/** The rotated node is the `<svg>` itself (foldingChevron.tsx sets
 *  `transform` inline on it); its INK is the Lucide `<path>` inside. */
function glyphSvg(button: Element): SVGSVGElement {
  return requireEl<SVGSVGElement>(button, "svg");
}

function glyphInk(button: Element): SVGPathElement {
  return requireEl<SVGPathElement>(button, "svg path");
}

/**
 * The computed 2-D transform as six numbers.
 *
 * WHY parsed rather than string-compared against `"matrix(0, 1, -1, 0, 0, 0)"`:
 * a 90° rotation is a `cos(π/2)` away from `6.1e-17` in the first slot on
 * any engine that does not special-case it, and a story that pins the exact
 * spelling would go red on a rounding difference that changes nothing a
 * reader can see.
 */
function transformMatrix(element: Element): number[] {
  const value = getComputedStyle(element).transform;
  if (value === "none") return [1, 0, 0, 1, 0, 0];
  const parts = value.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi);
  if (!parts || parts.length < 6) throw new Error(`unparseable transform: ${value}`);
  return parts.slice(-6).map(Number);
}

async function expectMatrixCloseTo(element: Element, want: number[]) {
  const got = transformMatrix(element);
  for (let i = 0; i < want.length; i += 1) {
    await expect(Math.abs(got[i] - want[i])).toBeLessThan(0.001);
  }
}

/**
 * Folded (▶) beside open (▼). The play function proves the rotation three
 * independent ways: the computed matrix, the glyph ink's own measured box
 * (a 90° turn swaps its width and height), and the button box NOT changing
 * — the rotation happens inside a fixed 24px hit target, so a folding
 * header never reflows when it opens.
 */
export const ClosedAndOpen: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16 }}>
      <FoldingChevron open={false} onClick={() => {}} data-testid="chevron-closed" />
      <FoldingChevron open onClick={() => {}} data-testid="chevron-open" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const closed = requireEl(canvasElement, '[data-testid="chevron-closed"]');
    const open = requireEl(canvasElement, '[data-testid="chevron-open"]');

    await expect(closed.getAttribute("aria-expanded")).toBe("false");
    await expect(open.getAttribute("aria-expanded")).toBe("true");

    await expectMatrixCloseTo(glyphSvg(closed), [1, 0, 0, 1, 0, 0]);
    await expectMatrixCloseTo(glyphSvg(open), [0, 1, -1, 0, 0, 0]);

    // Measured geometry, not DOM presence: a right-pointing chevron is tall
    // and narrow; turned 90° it is wide and short, and its two dimensions
    // are each other's, swapped.
    const closedInk = glyphInk(closed).getBoundingClientRect();
    const openInk = glyphInk(open).getBoundingClientRect();
    await expect(closedInk.height).toBeGreaterThan(closedInk.width + 1);
    await expect(openInk.width).toBeGreaterThan(openInk.height + 1);
    await expect(Math.abs(openInk.width - closedInk.height)).toBeLessThan(1);
    await expect(Math.abs(openInk.height - closedInk.width)).toBeLessThan(1);

    // The hit target is the same box in both states.
    const closedBox = closed.getBoundingClientRect();
    const openBox = open.getBoundingClientRect();
    await expect(Math.abs(openBox.width - closedBox.width)).toBeLessThan(0.5);
    await expect(Math.abs(openBox.height - closedBox.height)).toBeLessThan(0.5);
  },
};

/**
 * `reveal="hover"` against the default `reveal="always"`, and the one rule
 * that overrides it: a COLLAPSED section always shows its trigger, however
 * it was configured (foldingChevron.tsx's `alwaysForced`).
 *
 * The play function asserts the three resting opacities and — the claim the
 * component's own WHY makes — that hiding one never removes its layout box:
 * all three buttons measure the same, so revealing one shifts nothing.
 * Real cursor-driven `:hover` is not synthesizable by `userEvent` (it drives
 * pointer events, not the browser's tracked cursor), so this story
 * deliberately does not pretend to test it — the same line
 * src/components/Collapsible.stories.tsx draws.
 */
export const RevealModes: Story = {
  render: () => (
    <div className="group" style={{ display: "flex", gap: 16, padding: 8 }}>
      <FoldingChevron open reveal="always" onClick={() => {}} data-testid="reveal-always" />
      <FoldingChevron open reveal="hover" onClick={() => {}} data-testid="reveal-hover-open" />
      <FoldingChevron open={false} reveal="hover" onClick={() => {}} data-testid="reveal-hover-collapsed" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const always = requireEl(canvasElement, '[data-testid="reveal-always"]');
    const hoverOpen = requireEl(canvasElement, '[data-testid="reveal-hover-open"]');
    const hoverCollapsed = requireEl(canvasElement, '[data-testid="reveal-hover-collapsed"]');

    await expect(getComputedStyle(always).opacity).toBe("1");
    await expect(getComputedStyle(hoverOpen).opacity).toBe("0");
    await expect(getComputedStyle(hoverCollapsed).opacity).toBe("1");

    const boxes = [always, hoverOpen, hoverCollapsed].map((el) => el.getBoundingClientRect());
    for (const box of boxes) {
      await expect(Math.abs(box.width - boxes[0].width)).toBeLessThan(0.5);
      await expect(Math.abs(box.height - boxes[0].height)).toBeLessThan(0.5);
      await expect(box.width).toBeGreaterThan(0);
    }
  },
};

function ToggleDemo() {
  const [open, setOpen] = useState(false);
  return <FoldingChevron open={open} onClick={() => setOpen((value) => !value)} data-testid="chevron-toggle" />;
}

/**
 * One chevron, clicked. `waitFor` is doing real work here: the glyph
 * carries `transition-transform duration-150`, so the matrix is mid-turn
 * for a moment after the click — the assertion is that it SETTLES at 90°,
 * which is the thing a reader sees.
 */
export const TogglesOnClick: Story = {
  render: () => <ToggleDemo />,
  play: async ({ canvasElement }) => {
    const chevron = requireEl(canvasElement, '[data-testid="chevron-toggle"]');
    await expect(chevron.getAttribute("aria-expanded")).toBe("false");
    await expectMatrixCloseTo(glyphSvg(chevron), [1, 0, 0, 1, 0, 0]);

    await userEvent.click(chevron);
    await expect(chevron.getAttribute("aria-expanded")).toBe("true");
    await waitFor(async () => {
      await expectMatrixCloseTo(glyphSvg(chevron), [0, 1, -1, 0, 0, 0]);
    });

    await userEvent.click(chevron);
    await expect(chevron.getAttribute("aria-expanded")).toBe("false");
    await waitFor(async () => {
      await expectMatrixCloseTo(glyphSvg(chevron), [1, 0, 0, 1, 0, 0]);
    });
  },
};
