import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import {
  Port,
  PortEdge,
  PORT_EDGE_FIELDS,
  PORT_EDGE_PRESETS,
  type BlockSide,
  type PortTextLayout,
} from "@bbox-ui/core";
import { controlNames, defaultArgs, toArgTypes } from "@bbox-ui/schema";

/**
 * T1 Lane E: PortEdge. `argTypes`/`args` below are GENERATED from
 * `PORT_EDGE_FIELDS` (packages/bbox-ui/src/portEdge.fields.ts) — the SAME
 * array `demos/inspector`'s panel reads with `readFields`. Add a field
 * there and both surfaces pick it up; nothing here is kept in sync by
 * hand.
 *
 * No `Presets` story: `PORT_EDGE_PRESETS` is `[]` — PortEdge paints
 * nothing besides its own `+N more` disclosure text (T1-SPEC.md §4.6).
 */
const meta = {
  title: "Components/PortEdge",
  component: PortEdge,
  args: defaultArgs(PORT_EDGE_FIELDS, PORT_EDGE_PRESETS) as Partial<ComponentProps<typeof PortEdge>>,
  argTypes: toArgTypes(PORT_EDGE_FIELDS),
} satisfies Meta<typeof PortEdge>;

export default meta;

type Story = StoryObj<typeof meta>;

const EDGE_FIELD = PORT_EDGE_FIELDS.find((f) => f.id === "edge")!;
const LAYOUT_FIELD = PORT_EDGE_FIELDS.find((f) => f.id === "layout")!;
const TEXT_LAYOUT_FIELD = PORT_EDGE_FIELDS.find((f) => f.id === "textLayout")!;

/**
 * A gallery story sweeps ONE field and takes every other field from
 * `args`, so the Controls panel still drives it live. The swept field's
 * own control is disabled — Port.stories.tsx's own `sweep` precedent
 * (Zach, 2026-09-10: "the controls didn't work for the other things").
 */
const sweep = (fieldId: string) => ({
  controls: { exclude: controlNames(PORT_EDGE_FIELDS, [fieldId]) },
});

/**
 * Three real `<Port>` children, none setting their own `textLayout` — each
 * reads whatever `textLayout` this component itself is handed.
 *
 * WHY it forwards the prop instead of just rendering a Fragment:
 * `cascadeInto` in portEdge.tsx only unwraps `child.type === Fragment` on
 * its way down — a real component like `ThreePorts` is opaque to it and the
 * clone stops here, so the three `<Port>`s below never saw PortEdge's
 * cascade (measured: `--primary`, `--all-edges`, `--all-layouts` and
 * `--hidden-count` all painted `[right,right,right]` regardless of the Text
 * Layout control). PortEdge still clones `textLayout` onto `<ThreePorts>`
 * itself, so accepting and forwarding it here is enough — no change to
 * `cascadeInto`'s Fragment-only rule, which is deliberate.
 */
function ThreePorts({ textLayout }: { textLayout?: PortTextLayout }) {
  return (
    <>
      <Port state="empty" textLayout={textLayout}>
        alpha
      </Port>
      <Port state="wired" textLayout={textLayout}>
        beta
      </Port>
      <Port state="received" textLayout={textLayout}>
        gamma
      </Port>
    </>
  );
}

/**
 * PortEdge has no single "dot" of its own to click (T1-SPEC.md §6 item
 * 2's carve-out) — its interaction surface IS its children's. The play
 * function clicks the first child's dot (proving PortEdge's cloning
 * doesn't swallow events) and asserts PortEdge's OWN rendered DOM — the
 * `edge`/`layout` attributes and the `+N more` row it owns — matches
 * `args`.
 */
export const Primary: Story = {
  render: (args) => (
    <PortEdge {...args}>
      <ThreePorts />
    </PortEdge>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const edgeEl = canvasElement.querySelector('[data-slot="port-edge"]');
    if (!(edgeEl instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="port-edge"] element in the DOM');
    }
    await expect(edgeEl.getAttribute("data-edge")).toBe(args.edge);
    await expect(edgeEl.getAttribute("data-layout")).toBe(args.layout);

    const dot = canvasElement.querySelector('[data-slot="port-dot"]');
    if (dot instanceof HTMLElement) {
      await userEvent.click(dot);
      await expect(canvas.getByText("alpha")).toBeInTheDocument();
    }

    const moreRow = canvasElement.querySelector('[data-slot="port-edge-more"]');
    if (Number(args.hiddenCount) > 0) {
      await expect(moreRow).not.toBeNull();
      await expect(canvas.getByText(`+${args.hiddenCount} more`)).toBeInTheDocument();
    } else {
      await expect(moreRow).toBeNull();
    }
  },
};

/** Every real `BlockSide` wall, side by side. */
export const AllEdges: Story = {
  parameters: sweep("edge"),
  render: (args) => (
    <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
      {EDGE_FIELD.options!.map((option) => (
        <PortEdge {...args} key={option.value} edge={option.value as BlockSide}>
          <ThreePorts />
        </PortEdge>
      ))}
    </div>
  ),
};

/** `evenly` (PortEdge distributes) vs. `custom` (the host positions each
 * child itself — see the field's own hint). */
export const AllLayouts: Story = {
  parameters: sweep("layout"),
  render: (args) => (
    <div style={{ display: "flex", gap: 32 }}>
      {LAYOUT_FIELD.options!.map((option) => (
        <PortEdge
          {...args}
          key={option.value}
          layout={option.value as "evenly" | "custom"}
          style={{ height: 160 }}
        >
          <ThreePorts />
        </PortEdge>
      ))}
    </div>
  ),
};

/** Every real `PortTextLayout` cascade value — each lane holds one bare
 * Port taking the cascade, so the label's placement is what's on trial. */
export const AllTextLayouts: Story = {
  parameters: sweep("textLayout"),
  render: (args) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 32, padding: 24 }}>
      {TEXT_LAYOUT_FIELD.options!.map((option) => (
        <PortEdge {...args} key={option.value} textLayout={option.value as PortTextLayout}>
          <Port state="empty">{option.label}</Port>
        </PortEdge>
      ))}
    </div>
  ),
};

/**
 * The cascade's whole point, made visible: two Ports take whatever PortEdge
 * is cascading; the middle one sets its own `textLayout` and always wins.
 *
 * Two corrections against what this said before. It hard-coded `edge="top"`
 * AFTER spreading `args`, so the Edge control was live and moved nothing —
 * the only such site in the eight story files. And its claim that the two
 * outer Ports show the edge-DERIVED default was untrue: `textLayout` is an
 * ordinary arg with a default of "right", so `{...args}` always passes one
 * and the derivation never ran. Edge is swept here, so it leaves the panel
 * like every other gallery's swept axis, and Text Layout is what you drive.
 */
export const TextLayoutOverride: Story = {
  parameters: { controls: { exclude: controlNames(PORT_EDGE_FIELDS, ["edge"]) } },
  render: (args) => (
    <PortEdge {...args} edge="top">
      <Port state="empty">follows cascade</Port>
      <Port state="wired" textLayout="left">
        sets its own
      </Port>
      <Port state="received">follows cascade</Port>
    </PortEdge>
  ),
};

/** `hiddenCount` appends PortEdge's own trailing disclosure row — never a
 * cloned child, and never computed from `children` itself. */
export const HiddenCount: Story = {
  args: { hiddenCount: 4 },
  render: (args) => (
    <PortEdge {...args}>
      <ThreePorts />
    </PortEdge>
  ),
};

/** Zero children — just the empty lane, still honouring `edge`/`layout`. */
export const Empty: Story = {
  render: (args) => <PortEdge {...args} />,
};
