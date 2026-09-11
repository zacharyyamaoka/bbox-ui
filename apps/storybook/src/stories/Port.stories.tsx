import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { PORT_STATES, PORT_TEXT_LAYOUTS, Port } from "@bbox-ui/core";

/**
 * T0 SPIKE story. Deliberately the existing `Port` component, unmodified —
 * the question isn't "can we build a component for this", it's "can THIS
 * component, imported from the real workspace package, mount inside a real
 * React Flow node and a real tldraw shape via nothing but a global toggle."
 */
const meta = {
  title: "T0 Spike/Port",
  component: Port,
  args: {
    state: "wired",
    size: "md",
    textLayout: "right",
    textSize: "md",
    children: "Story Port",
  },
  argTypes: {
    state: { control: "select", options: PORT_STATES },
    size: { control: "select", options: ["sm", "md", "lg"] },
    textLayout: { control: "select", options: PORT_TEXT_LAYOUTS },
    textSize: { control: "select", options: ["md", "lg", "xl"] },
  },
} satisfies Meta<typeof Port>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // One real interaction: find the dot by the same data-slot the real
    // adapters key off of (see packages/adapter-tldraw's data-port-id
    // convention), then click it. Port itself has no click handler — the
    // point is proving a play function's queries and events reach a DOM
    // node that may be three frameworks deep (plain div, React Flow's node
    // wrapper, or tldraw's HTMLContainer) by the time this runs.
    const dot = canvasElement.querySelector('[data-slot="port-dot"]');
    if (!(dot instanceof HTMLElement)) {
      throw new Error("expected a [data-slot=\"port-dot\"] element in the DOM");
    }
    await userEvent.click(dot);

    // One real assertion: the label text and the dot's painted state both
    // match the args this story was rendered with, in whichever host.
    await expect(canvas.getByText(String(args.children))).toBeInTheDocument();
    await expect(dot.getAttribute("data-state")).toBe(args.state);
  },
};

export const AllStates: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {PORT_STATES.map((state) => (
        <Port key={state} state={state}>
          {state}
        </Port>
      ))}
    </div>
  ),
};
