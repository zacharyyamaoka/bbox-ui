import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Slider } from "./slider";

/**
 * Stock shadcn `base-nova` Slider (components/slider.tsx) over Base UI's
 * Slider primitive — the continuous-value control the settings surface and
 * the control strip reach for instead of hand-rolling a drag. Nothing in the
 * app consumes it yet; these stories are the primitive itself.
 *
 * Every assertion below reads the thumb's own `<input type="range">` (Base
 * UI renders one per thumb, visually hidden inside `[data-slot=slider-thumb]`
 * — that input is what `role="slider"` resolves to, and what carries
 * `aria-valuenow`/`min`/`max`/`step`).
 *
 * WHY `TrackIsVisible` measures rather than checks classes: the stock copy
 * styled the track and indicator behind `data-horizontal:`/`data-vertical:`,
 * which Tailwind lowers to the attribute-PRESENCE selectors
 * `[data-horizontal]`/`[data-vertical]` — while Base UI emits
 * `data-orientation="horizontal"|"vertical"`, so those rules never matched and
 * the track rendered at 0px, thumbs floating on nothing. `slider.tsx` now uses
 * `data-[orientation=…]:` (see its header; `separator.tsx` documents the same
 * upstream bug) and `stockPrimitives.test.ts` pins the deviation. A class-name
 * assertion would have passed the whole time the component was broken, which is
 * exactly why this one reads the rendered box instead.
 */
const meta = {
  title: "Basics/Slider",
  tags: ["area:basics", "lane:baseline"],
  component: Slider,
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One thumb, the default 0–100 bounds, driven by the keyboard. */
export const Default: Story = {
  args: { defaultValue: [40] },
  render: (args) => (
    <div style={{ width: 240 }}>
      <Slider {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const thumb = canvas.getByRole("slider");
    await expect(thumb).toHaveAttribute("aria-valuenow", "40");
    await expect(thumb).toHaveAttribute("min", "0");
    await expect(thumb).toHaveAttribute("max", "100");

    // The value actually moves — one step per arrow key, not just a rendered number.
    thumb.focus();
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(thumb).toHaveAttribute("aria-valuenow", "41"));
  },
};

/** Two thumbs from a two-element `defaultValue`, on coarser bounds — the
 *  range case, where `min`/`max`/`step` are all non-default. */
export const Range: Story = {
  args: { defaultValue: [20, 80], min: 0, max: 200, step: 10 },
  render: (args) => (
    <div style={{ width: 240 }}>
      <Slider {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const thumbs = canvas.getAllByRole("slider");
    await expect(thumbs).toHaveLength(2);
    await expect(thumbs.map((thumb) => thumb.getAttribute("aria-valuenow"))).toEqual(["20", "80"]);
    await expect(thumbs[0]).toHaveAttribute("max", "200");
    await expect(thumbs[0]).toHaveAttribute("step", "10");

    // The step is the real one: one arrow press moves 10, not 1.
    thumbs[0].focus();
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(thumbs[0]).toHaveAttribute("aria-valuenow", "30"));
  },
};

/** `disabled` — the thumb is out of the tab order and the value cannot move. */
export const Disabled: Story = {
  args: { defaultValue: [50], disabled: true },
  render: (args) => (
    <div style={{ width: 240 }}>
      <Slider {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const thumb = canvas.getByRole("slider");
    await expect(thumb).toBeDisabled();
    await expect(thumb).toHaveAttribute("aria-valuenow", "50");
    thumb.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(thumb).toHaveAttribute("aria-valuenow", "50");
  },
};

/**
 * The regression guard for the orientation-selector fix. A zero-height track
 * is what the bug looked like, so height is asserted as a positive number and
 * the indicator is asserted to track the value, not merely to exist.
 */
export const TrackIsVisible: Story = {
  args: { defaultValue: [40] },
  play: async ({ canvasElement }) => {
    const track = canvasElement.querySelector('[data-slot="slider-track"]');
    const indicator = canvasElement.querySelector('[data-slot="slider-range"]');
    await expect(track).not.toBeNull();
    await expect(indicator).not.toBeNull();

    const trackBox = (track as HTMLElement).getBoundingClientRect();
    const fillBox = (indicator as HTMLElement).getBoundingClientRect();

    // `h-1` = 0.25rem. The bug rendered 0; assert the real painted height.
    await expect(trackBox.height).toBeGreaterThan(0);
    await expect(trackBox.height).toBeCloseTo(4, 0);
    await expect(fillBox.height).toBeCloseTo(trackBox.height, 0);

    // The orientation attribute the corrected selector actually reads.
    await expect(track as HTMLElement).toHaveAttribute("data-orientation", "horizontal");

    // 40 of 0-100 — the indicator is a real proportion of the track, not full
    // width and not zero. Generous bounds: thumbAlignment="edge" insets it.
    const ratio = fillBox.width / trackBox.width;
    await expect(ratio).toBeGreaterThan(0.25);
    await expect(ratio).toBeLessThan(0.55);
  },
};
