import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { defaultArgs, toArgTypes } from "@bbox-ui/schema";
import {
  Port,
  PORT_FIELDS,
  type AppearanceState,
  type BlockSide,
  type Lens,
  type PortDecoration,
  type PortDirection,
  type PortReveal,
  type PortRole,
  type PortSize,
  type PortTextLayout,
  type PortTextSize,
  type Tone,
} from "@bbox-ui/core";
import type { ComponentProps } from "react";

/**
 * T1 Lane P: the REBUILT Port, end to end. `argTypes`/`args` below are
 * GENERATED from `PORT_FIELDS` (packages/bbox-ui/src/port.fields.ts) —
 * the SAME array the generic product inspector (demos/inspector) reads.
 * Add a field there and both surfaces pick it up; nothing here is kept
 * in sync by hand.
 *
 * No `Presets` story: `PORT_PRESETS` is empty (port.presets.ts) — Port's
 * colour comes from a hand-written `state`/`tone` lookup, not a
 * separately governed paint field, so there is nothing for a preset to
 * govern (docs/T1-SPEC.md §4.7). Every `segments` field therefore gets
 * its own gallery below (§6 point 4) instead of being folded into one.
 *
 * The cast on `args` is deliberate: `defaultArgs` returns the generic
 * `Record<string, FieldValue>` shape every schema-driven component
 * shares — one degree looser than `Port`'s own literal-union prop types.
 * `port.fields.test.ts` is what actually proves the values line up.
 */
const meta = {
  title: "Components/Port",
  component: Port,
  args: defaultArgs(PORT_FIELDS) as Partial<ComponentProps<typeof Port>>,
  argTypes: toArgTypes(PORT_FIELDS),
} satisfies Meta<typeof Port>;

export default meta;

type Story = StoryObj<typeof meta>;

const DIRECTION_FIELD = PORT_FIELDS.find((f) => f.id === "direction")!;
const EDGE_FIELD = PORT_FIELDS.find((f) => f.id === "edge")!;
const DIAMETER_FIELD = PORT_FIELDS.find((f) => f.id === "diameter")!;
const ROLE_FIELD = PORT_FIELDS.find((f) => f.id === "role")!;
const DECORATION_FIELD = PORT_FIELDS.find((f) => f.id === "decoration")!;
const TEXT_LAYOUT_FIELD = PORT_FIELDS.find((f) => f.id === "textLayout")!;
const TEXT_SIZE_FIELD = PORT_FIELDS.find((f) => f.id === "textSize")!;
const STATE_FIELD = PORT_FIELDS.find((f) => f.id === "state")!;
const TONE_FIELD = PORT_FIELDS.find((f) => f.id === "tone")!;
const LENS_FIELD = PORT_FIELDS.find((f) => f.id === "lens")!;
const REVEAL_FIELD = PORT_FIELDS.find((f) => f.id === "reveal")!;

/**
 * THE STORY THAT CARRIES THE PLAY FUNCTION. Click the painted dot —
 * reachable whether this DOM node sits three frameworks deep (plain div,
 * a React Flow node, a tldraw HTMLContainer shape) by the time this runs
 * — then assert the name/type text and the dot's `data-state` both match
 * the args this story was actually rendered with. `PORT_FIELDS`' own
 * `name`/`type` defaults are empty strings (nothing real to click
 * through to), so this story overrides both to a realistic pair without
 * touching the field defaults everything else in this file relies on.
 */
export const Primary: Story = {
  args: { name: "frameImage", type: "Image" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const dot = canvasElement.querySelector('[data-slot="port-dot"]');
    if (!(dot instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="port-dot"] element in the DOM');
    }
    await userEvent.click(dot);
    await expect(canvas.getByText(String(args.name))).toBeInTheDocument();
    await expect(canvas.getByText(String(args.type))).toBeInTheDocument();
    await expect(dot.getAttribute("data-state")).toBe(args.state);
  },
};

/**
 * A gallery story sweeps ONE field and takes every other field from `args`,
 * so the Controls panel still drives it live. The swept field's own control
 * is disabled, because a story that paints every value at once cannot honour
 * a single control value and a control that silently does nothing reads as
 * broken (Zach, 2026-09-10: "the controls didn't work for the other
 * things"). Every row's `name` falls back to the swept option's own label
 * when Controls hasn't set one, so a field with no visual effect of its own
 * (`lens`, today — docs/T1-SPEC.md §3 defines no lens paint tokens yet)
 * still reads as doing something.
 */
const sweep = (fieldId: string) => ({
  controls: { exclude: [fieldId] },
});

const galleryRow = { display: "flex", flexDirection: "column" as const, gap: 16 };
const galleryRowInline = { display: "flex", alignItems: "center" as const, gap: 24, flexWrap: "wrap" as const };

/** Every real AppearanceState (docs/T1-SPEC.md §3) — including runtime-only
 * `received`, and `hidden`, which renders nothing (see the row gap). */
export const AllStates: Story = {
  parameters: sweep("state"),
  render: (args) => (
    <div style={galleryRow}>
      {STATE_FIELD.options!.map((option) => (
        <Port
          {...args}
          key={option.value}
          state={option.value as AppearanceState}
          name={(args.name as string) || option.label}
        />
      ))}
    </div>
  ),
};

/** Every real Tone — the escape hatch that reaches past `state`. */
export const AllTones: Story = {
  parameters: sweep("tone"),
  render: (args) => (
    <div style={galleryRowInline}>
      {TONE_FIELD.options!.map((option) => (
        <Port
          {...args}
          key={option.value}
          tone={option.value as Tone}
          name={(args.name as string) || option.label}
        />
      ))}
    </div>
  ),
};

/** input vs output — mirrors the name/type/chip order (PORT-SPEC.md §3f). */
export const AllDirections: Story = {
  parameters: sweep("direction"),
  render: (args) => (
    <div style={galleryRowInline}>
      {DIRECTION_FIELD.options!.map((option) => (
        <Port
          {...args}
          key={option.value}
          direction={option.value as PortDirection}
          name={(args.name as string) || option.label}
        />
      ))}
    </div>
  ),
};

/** Every block wall a port can sit on; drives `textLayout`'s own default. */
export const AllEdges: Story = {
  parameters: sweep("edge"),
  render: (args) => (
    <div style={galleryRowInline}>
      {EDGE_FIELD.options!.map((option) => (
        <Port
          {...args}
          key={option.value}
          edge={option.value as BlockSide}
          name={(args.name as string) || option.label}
        />
      ))}
    </div>
  ),
};

/** Every real diameter (8 / 12 / 18px) — PORT-SPEC.md's measured ladder. */
export const AllDiameters: Story = {
  parameters: sweep("diameter"),
  render: (args) => (
    <div style={galleryRowInline}>
      {DIAMETER_FIELD.options!.map((option) => (
        <Port
          {...args}
          key={option.value}
          diameter={option.value as PortSize}
          name={(args.name as string) || option.label}
        />
      ))}
    </div>
  ),
};

/** Every semantic role — only a non-"data" role paints the cue text. */
export const AllRoles: Story = {
  parameters: sweep("role"),
  render: (args) => (
    <div style={galleryRow}>
      {ROLE_FIELD.options!.map((option) => (
        <Port
          {...args}
          key={option.value}
          role={option.value as PortRole}
          name={(args.name as string) || option.label}
        />
      ))}
    </div>
  ),
};

/** `mutates` and every `variadic-*` — one shared ring, mutually exclusive
 * by construction (PORT-SPEC.md §2.2). */
export const AllDecorations: Story = {
  parameters: sweep("decoration"),
  render: (args) => (
    <div style={galleryRow}>
      {DECORATION_FIELD.options!.map((option) => (
        <Port
          {...args}
          key={option.value}
          decoration={option.value as PortDecoration}
          name={(args.name as string) || option.label}
        />
      ))}
    </div>
  ),
};

/** Every real PortTextLayout (top/bot/right/left — narrowed from T0's six,
 * PORT-SPEC.md §3f: the app has no horizontal "offset" label). */
export const AllTextLayouts: Story = {
  parameters: sweep("textLayout"),
  render: (args) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 32, padding: 24 }}>
      {TEXT_LAYOUT_FIELD.options!.map((option) => (
        <Port
          {...args}
          key={option.value}
          textLayout={option.value as PortTextLayout}
          name={(args.name as string) || option.label}
        />
      ))}
    </div>
  ),
};

/** Every real PortTextSize rung (18/24/36/44px) — Port's own ladder,
 * deliberately separate from `layout.ts`'s `TEXT_SIZES` (docs/T1-SPEC.md
 * §0). */
export const AllTextSizes: Story = {
  parameters: sweep("textSize"),
  render: (args) => (
    <div style={galleryRowInline}>
      {TEXT_SIZE_FIELD.options!.map((option) => (
        <Port
          {...args}
          key={option.value}
          textSize={option.value as PortTextSize}
          name={(args.name as string) || option.label}
        />
      ))}
    </div>
  ),
};

/** The diff/lint overlay. No lens paints a distinct treatment yet
 * (docs/T1-SPEC.md §3 defines no lens tokens) — each row's caption is
 * the only visible signal today; `data-lens` is set for a host to style. */
export const AllLenses: Story = {
  parameters: sweep("lens"),
  render: (args) => (
    <div style={galleryRowInline}>
      {LENS_FIELD.options!.map((option) => (
        <Port
          {...args}
          key={option.value}
          lens={option.value as Lens}
          name={(args.name as string) || option.label}
        />
      ))}
    </div>
  ),
};

/** `"always"` vs `"onHover"` — hover this story's canvas to see the
 * `onHover` row fade in (standing in for "the container is hovered",
 * since a standalone specimen has no outer container — see port.tsx). */
export const AllReveals: Story = {
  parameters: sweep("reveal"),
  render: (args) => (
    <div style={galleryRowInline}>
      {REVEAL_FIELD.options!.map((option) => (
        <Port
          {...args}
          key={option.value}
          reveal={option.value as PortReveal}
          name={(args.name as string) || option.label}
        />
      ))}
    </div>
  ),
};

/**
 * The escape hatch actually engaged: `children` REPLACES the three-span
 * name/type/default-chip rendering wholesale (PORT-SPEC.md §7 Q6).
 */
export const CustomLabel: Story = {
  args: { name: "unused", type: "unused", defaultValue: "unused" },
  render: (args) => <Port {...args}>name: Type = default</Port>,
};

/** `producers >= 2` shows the many-to-one count badge. */
export const ManyProducers: Story = {
  args: { name: "pose", direction: "output", producers: 3 },
};

/** `state: "hidden"` renders nothing at all — a container rolls it into
 * its own `+N more` summary (`PortHiddenSummary`, exported from
 * `./port.tsx`, not exercised as a standalone story: it is the
 * CONTAINER's part, not one Port's — PORT-SPEC.md §4's "owned by the
 * host" table). */
export const Hidden: Story = {
  args: { name: "hiddenPort", state: "hidden" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-slot="port"]')).toBeNull();
  },
};
