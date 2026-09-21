import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { AlignCenter, AlignLeft, AlignRight, Grid2x2, List, Rows3 } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

/**
 * Segmented toggles — view mode, filters, density, table layout
 * (`compare/CompareDialog.tsx:848-869`, `diagnostics/BoardDiagnosticsPanel.tsx:119-137`
 * in the donor, both hand-rolled `role=group`). This is the ONE case in the
 * kit where `spacing` matters visually: `spacing={0}` fuses items into one
 * bordered strip (adjacent corners collapse, shared border), `spacing>0`
 * (the default, 2px) reads as separate pills with a gap.
 */
const meta = {
  title: "Basics/ToggleGroup",
  component: ToggleGroup,
} satisfies Meta<typeof ToggleGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `multiple` (checkbox semantics) vs single-select (radio semantics) — the
 *  same primitive, `value`/`defaultValue` shaped as an array either way. */
export const SingleVsMultiple: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-muted-foreground mb-1 text-xs">Single-select (view mode)</p>
        <ToggleGroup defaultValue={["grid"]}>
          <ToggleGroupItem value="grid" aria-label="Grid" variant="outline">
            <Grid2x2 />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List" variant="outline">
            <List />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div>
        <p className="text-muted-foreground mb-1 text-xs">Multi-select (filters)</p>
        <ToggleGroup multiple defaultValue={["errors"]}>
          <ToggleGroupItem value="errors" aria-label="Errors" variant="outline">
            Errors
          </ToggleGroupItem>
          <ToggleGroupItem value="warnings" aria-label="Warnings" variant="outline">
            Warnings
          </ToggleGroupItem>
          <ToggleGroupItem value="info" aria-label="Info" variant="outline">
            Info
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  ),
};

/** `spacing={0}` — the fused, table-layout-segmented look: no gap, shared
 *  hairline border between items, only the outer corners round. */
export const FusedSpacingZero: Story = {
  render: () => (
    <ToggleGroup spacing={0} defaultValue={["left"]}>
      <ToggleGroupItem value="left" aria-label="Align left" variant="outline">
        <AlignLeft />
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Align center" variant="outline">
        <AlignCenter />
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Align right" variant="outline">
        <AlignRight />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
};

/** Vertical orientation — the density toggle's own shape, a narrow column
 *  of stacked options rather than a row. */
export const Vertical: Story = {
  render: () => (
    <ToggleGroup orientation="vertical" spacing={0} defaultValue={["comfortable"]} className="w-32">
      <ToggleGroupItem value="compact" aria-label="Compact" variant="outline">
        <Rows3 /> Compact
      </ToggleGroupItem>
      <ToggleGroupItem value="comfortable" aria-label="Comfortable" variant="outline">
        <Rows3 /> Comfortable
      </ToggleGroupItem>
    </ToggleGroup>
  ),
};

/** Every size rung side by side. */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      {(["sm", "default", "lg"] as const).map((size) => (
        <ToggleGroup key={size} defaultValue={["a"]} size={size}>
          <ToggleGroupItem value="a" aria-label="A" variant="outline">
            A
          </ToggleGroupItem>
          <ToggleGroupItem value="b" aria-label="B" variant="outline">
            B
          </ToggleGroupItem>
        </ToggleGroup>
      ))}
    </div>
  ),
};

/** One item disabled inside an otherwise-live group. */
export const DisabledItem: Story = {
  render: () => (
    <ToggleGroup defaultValue={["a"]}>
      <ToggleGroupItem value="a" aria-label="A" variant="outline">
        A
      </ToggleGroupItem>
      <ToggleGroupItem value="b" aria-label="B" variant="outline" disabled>
        B
      </ToggleGroupItem>
      <ToggleGroupItem value="c" aria-label="C" variant="outline">
        C
      </ToggleGroupItem>
    </ToggleGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "B" })).toBeDisabled();
  },
};

/** `aria-pressed` (via Base UI's `data-pressed`) actually flips on click —
 *  the state the docs table's "Segmented toggles" row promises. */
function ControlledDemo() {
  const [value, setValue] = useState<string[]>(["grid"]);
  return (
    <ToggleGroup value={value} onValueChange={(next) => setValue(next as string[])}>
      <ToggleGroupItem value="grid" aria-label="Grid" variant="outline">
        Grid
      </ToggleGroupItem>
      <ToggleGroupItem value="list" aria-label="List" variant="outline">
        List
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export const ControlledSelection: Story = {
  render: () => <ControlledDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const grid = canvas.getByRole("button", { name: "Grid" });
    const list = canvas.getByRole("button", { name: "List" });

    await expect(grid).toHaveAttribute("data-pressed");
    await userEvent.click(list);
    await expect(list).toHaveAttribute("data-pressed");
    await expect(grid).not.toHaveAttribute("data-pressed");
  },
};
