import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { defaultArgs, toArgTypes } from "@bbox-ui/schema";
import {
  Port,
  PORT_FIELDS,
  type PortSize,
  type PortState,
  type PortTextLayout,
  type TextSize,
} from "@bbox-ui/core";
import type { ComponentProps } from "react";

/**
 * T0: Port, end to end. `argTypes`/`args` below are GENERATED from
 * `PORT_FIELDS` (packages/bbox-ui/src/port.fields.ts) — the SAME array
 * `PortInspectorPanel` (demos/port-inspector) reads with `readFields`. Add
 * a field there and both surfaces pick it up; nothing here is kept in sync
 * by hand.
 *
 * The cast on `args` is deliberate: `defaultArgs` returns the generic
 * `Record<string, FieldValue>` shape every future schema-driven component
 * shares — one degree looser than `Port`'s own literal-union prop types.
 * `port.fields.test.ts` is what actually proves the values line up.
 */
const meta = {
  title: "T0 Spike/Port",
  component: Port,
  args: defaultArgs(PORT_FIELDS) as Partial<ComponentProps<typeof Port>>,
  argTypes: toArgTypes(PORT_FIELDS),
} satisfies Meta<typeof Port>;

export default meta;

type Story = StoryObj<typeof meta>;

const STATE_FIELD = PORT_FIELDS.find((f) => f.id === "state")!;
const SIZE_FIELD = PORT_FIELDS.find((f) => f.id === "size")!;
const LAYOUT_FIELD = PORT_FIELDS.find((f) => f.id === "textLayout")!;
const TEXT_SIZE_FIELD = PORT_FIELDS.find((f) => f.id === "textSize")!;

/**
 * THE STORY THAT CARRIES THE PLAY FUNCTION. Click the painted dot —
 * reachable whether this DOM node sits three frameworks deep (plain div,
 * a React Flow node, a tldraw HTMLContainer shape) by the time this runs —
 * then assert the label text and the dot's `data-state` both match the
 * args this story was actually rendered with, in whichever host is active.
 */
export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const dot = canvasElement.querySelector('[data-slot="port-dot"]');
    if (!(dot instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="port-dot"] element in the DOM');
    }
    await userEvent.click(dot);
    await expect(canvas.getByText(String(args.children))).toBeInTheDocument();
    await expect(dot.getAttribute("data-state")).toBe(args.state);
  },
};

/** Every real PortState, side by side — including runtime-only `received`. */
export const AllStates: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {STATE_FIELD.options!.map((option) => (
        <Port key={option.value} state={option.value as PortState}>
          {option.label}
        </Port>
      ))}
    </div>
  ),
};

/** Every real PortSize (the three diameters — 14 / 25 / 36px). */
export const AllSizes: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      {SIZE_FIELD.options!.map((option) => (
        <Port key={option.value} state="wired" size={option.value as PortSize}>
          {option.label}
        </Port>
      ))}
    </div>
  ),
};

/** Every real PortTextLayout (top/bot/right/left/right-offset/left-offset). */
export const AllTextLayouts: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 32, padding: 24 }}>
      {LAYOUT_FIELD.options!.map((option) => (
        <Port key={option.value} state="default" textLayout={option.value as PortTextLayout}>
          {option.label}
        </Port>
      ))}
    </div>
  ),
};

/** Every real TextSize rung (md/lg/xl). */
export const AllTextSizes: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      {TEXT_SIZE_FIELD.options!.map((option) => (
        <Port key={option.value} state="wired" textSize={option.value as TextSize}>
          {option.label}
        </Port>
      ))}
    </div>
  ),
};

/**
 * The closest real analog to "hidden": `Port` has no `visible` prop today
 * (docs/T0-SPEC.md §9) — omitting `children` is the one real way to get
 * the bare dot with nothing else painted.
 */
export const NoLabel: Story = {
  args: { children: undefined },
};
