import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { Code2, HelpCircle, Scan, ZoomIn, ZoomOut } from "lucide-react";

import { StatusStrip, type StatusStripItem } from "./statusStrip";
import { ProblemsBadge } from "./problemsPanel";
import { Button } from "./button";

const meta = {
  title: "Components/Menus & Bars/StatusStrip",
  tags: ["object:chrome"],
  component: StatusStrip,
  // WHY base `args`: `items` has no sensible default, so CSF3 typegen
  // requires it here. Every story below supplies its own real items via
  // `render`'s closure instead of reading `args` — this fixture only
  // exists to satisfy the required-args contract.
  args: {
    items: [],
  },
} satisfies Meta<typeof StatusStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The exact screenshot 06/07 cluster: frames · problems(99+) · 45% · dev(●) · help. */
export const Default: Story = {
  render: function Render() {
    const [framesOpen, setFramesOpen] = useState(true);
    const items: StatusStripItem[] = [
      { id: "frames", icon: <Scan className="size-4" />, label: "Board overview and saved views", active: framesOpen, onSelect: () => setFramesOpen((value) => !value) },
      { id: "problems", icon: <ProblemsBadge count={175} />, label: "Problems — 175 issues", onSelect: fn() },
      { id: "dev", icon: <Code2 className="size-4" />, label: "Development views — new Preview available", indicator: "success", onSelect: fn() },
      { id: "help", icon: <HelpCircle className="size-4" />, label: "Help", onSelect: fn() },
    ];
    return (
      <StatusStrip items={items}>
        <span data-testid="zoom-readout">45%</span>
      </StatusStrip>
    );
  },
};

/** Clicking an item toggles its own `active` (aria-pressed) state — the frames launcher here. */
export const ActiveToggle: Story = {
  render: function Render() {
    const [active, setActive] = useState(false);
    const items: StatusStripItem[] = [
      { id: "frames", icon: <Scan className="size-4" />, label: "Board overview and saved views", active, onSelect: () => setActive((value) => !value) },
      { id: "help", icon: <HelpCircle className="size-4" />, label: "Help", onSelect: fn() },
    ];
    return <StatusStrip items={items} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: /board overview/i });
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    await expect(button).toHaveAttribute("aria-pressed", "true");
  },
};

/** `children` as a live readout WITH its own control — zoom ± flanking the percentage, matching `DefaultZoomMenu`'s neighbors in the donor. */
export const WithZoomControls: Story = {
  render: function Render() {
    const [zoom, setZoom] = useState(100);
    const items: StatusStripItem[] = [
      { id: "frames", icon: <Scan className="size-4" />, label: "Board overview", onSelect: fn() },
      { id: "problems", icon: <ProblemsBadge count={0} />, label: "Problems — 0 issues", onSelect: fn() },
      { id: "dev", icon: <Code2 className="size-4" />, label: "Development views", onSelect: fn() },
      { id: "help", icon: <HelpCircle className="size-4" />, label: "Help", onSelect: fn() },
    ];
    return (
      <StatusStrip items={items}>
        <Button variant="ghost" size="icon-xs" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(10, z - 10))}>
          <ZoomOut className="size-3.5" />
        </Button>
        <span style={{ minWidth: 36, textAlign: "center" }}>{zoom}%</span>
        <Button variant="ghost" size="icon-xs" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(400, z + 10))}>
          <ZoomIn className="size-3.5" />
        </Button>
      </StatusStrip>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("100%")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Zoom in" }));
    await expect(canvas.getByText("110%")).toBeInTheDocument();
  },
};

/** No `children` at all — items only, no readout segment or its flanking separators. */
export const NoReadout: Story = {
  render: () => {
    const items: StatusStripItem[] = [
      { id: "frames", icon: <Scan className="size-4" />, label: "Board overview", onSelect: fn() },
      { id: "help", icon: <HelpCircle className="size-4" />, label: "Help", onSelect: fn() },
    ];
    return <StatusStrip items={items} />;
  },
};

/** Every `indicator` tone, and a plain numeric `badge` (distinct from `ProblemsBadge`'s own compound icon). */
export const IndicatorsAndBadges: Story = {
  render: () => {
    const items: StatusStripItem[] = [
      { id: "success", icon: <Code2 className="size-4" />, label: "Success indicator", indicator: "success", onSelect: fn() },
      { id: "warning", icon: <Code2 className="size-4" />, label: "Warning indicator", indicator: "warning", onSelect: fn() },
      { id: "danger", icon: <Code2 className="size-4" />, label: "Danger indicator", indicator: "danger", onSelect: fn() },
      { id: "badge", icon: <Scan className="size-4" />, label: "Plain numeric badge", badge: 3, onSelect: fn() },
      { id: "badge-text", icon: <Scan className="size-4" />, label: "Plain text badge", badge: "new", onSelect: fn() },
    ];
    return <StatusStrip items={items} />;
  },
};

/** An odd item count — `children` still splits roughly down the middle (`Math.ceil(n / 2)` leading). */
export const OddItemCount: Story = {
  render: () => {
    const items: StatusStripItem[] = [
      { id: "a", icon: <Scan className="size-4" />, label: "A", onSelect: fn() },
      { id: "b", icon: <Code2 className="size-4" />, label: "B", onSelect: fn() },
      { id: "c", icon: <HelpCircle className="size-4" />, label: "C", onSelect: fn() },
    ];
    return (
      <StatusStrip items={items}>
        <span>readout</span>
      </StatusStrip>
    );
  },
};
