import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { controlNames, defaultArgs, toArgTypes, type FieldValue } from "@bbox-ui/schema";
import {
  Block,
  BlockChip,
  BlockDescription,
  BlockGlyph,
  BlockHeader,
  BlockTitle,
  BlockType,
  BLOCK_FIELDS,
  BLOCK_PRESETS,
  type AppearanceState,
  type BlockOrientation,
  type Lens,
  type Tone,
} from "@bbox-ui/core";
import type { ComponentType } from "react";

/**
 * T1 Lane B: `Block`'s first `FieldSpec` array, and `BlockChip` as a thin
 * `<Pill>` wrapper (docs/T1-SPEC.md §4.8 — a deliberately narrow, minimal
 * rebuild; body-layout/paint integration is explicitly deferred there and
 * in §10). `argTypes`/`args` are GENERATED from `BLOCK_FIELDS`
 * (packages/bbox-ui/src/block.fields.ts) — the same array `demos/inspector`
 * reads. Add a field there and both surfaces pick it up.
 *
 * Unlike `Port`/`Pill`, `Block` itself does not accept most of these
 * fields directly — `width`/`height` are real `BlockProps`, `orientation`
 * is real `BlockHeaderProps`, but `state`/`tone`/`lens`/`lensBefore` only
 * mean something on a composed `<BlockChip>` (§4.8: "forwarded … only
 * when a chip is present, else inert"). So `meta.render` composes the
 * real anatomy (`Block > BlockHeader > BlockGlyph + BlockTitle +
 * BlockChip`, `packages/adapter-tldraw/src/block-shape-util.tsx`'s own
 * shape) and routes each arg to the child it actually governs — never a
 * bare `<Block {...args} />`, which would leave every field but
 * width/height inert. `children`/title/description text are NOT
 * `FieldSpec` rows (structural, composed by hand) — same reasoning
 * `Flex`/`Stack`'s own stories already document.
 *
 * DEVIATION from Port/Pill's own `Meta<typeof Component>` shape, reported
 * per the lane brief: `Port`/`Pill` genuinely accept every one of their
 * own fields as a real prop, so inferring the story's Args from
 * `ComponentProps<typeof Component>` is exact. `Block`'s fields are
 * deliberately spread across FOUR real components (`Block`,
 * `BlockHeader`, `BlockChip`) — `ComponentProps<typeof Block>` alone would
 * be missing `orientation`/`state`/`tone`/`lens`/`lensBefore` entirely, so
 * this file declares its own `BlockStoryArgs` (the true shape
 * `BLOCK_FIELDS` describes) and casts only the `component` metadata field
 * (used for the addon's auto-generated prop table, never for type-checking
 * a render) rather than pretending `Block` itself takes every field.
 *
 * No `Presets` story: `BLOCK_PRESETS` is empty (`block.presets.ts`) —
 * Block forwards to its chip's own `PILL_PRESETS` rather than governing a
 * paint field of its own (T1-SPEC.md §4.8). Every `segments` field
 * therefore gets its own gallery below (§6 point 4), Port's own precedent
 * for a presetless component.
 */
interface BlockStoryArgs {
  width: number;
  height: number;
  orientation: BlockOrientation;
  state: AppearanceState;
  tone: Tone;
  lens: Lens;
  lensBefore: string;
}

function renderBlock(args: BlockStoryArgs) {
  return (
    <Block width={args.width} height={args.height}>
      <BlockHeader orientation={args.orientation}>
        <BlockGlyph>◆</BlockGlyph>
        <BlockTitle>Block</BlockTitle>
        <BlockChip state={args.state} tone={args.tone} lens={args.lens} lensBefore={args.lensBefore}>
          Chip
        </BlockChip>
      </BlockHeader>
      <BlockDescription>Description</BlockDescription>
      <BlockType>Type</BlockType>
    </Block>
  );
}

const meta = {
  title: "Components/Block",
  component: Block as unknown as ComponentType<BlockStoryArgs>,
  args: defaultArgs(BLOCK_FIELDS, BLOCK_PRESETS) as unknown as BlockStoryArgs,
  argTypes: toArgTypes(BLOCK_FIELDS),
  render: renderBlock,
} satisfies Meta<BlockStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

const ORIENTATION_FIELD = BLOCK_FIELDS.find((f) => f.id === "orientation")!;
const STATE_FIELD = BLOCK_FIELDS.find((f) => f.id === "state")!;
const TONE_FIELD = BLOCK_FIELDS.find((f) => f.id === "tone")!;
const LENS_FIELD = BLOCK_FIELDS.find((f) => f.id === "lens")!;

function withField(args: BlockStoryArgs, id: keyof BlockStoryArgs, value: FieldValue): BlockStoryArgs {
  return { ...args, [id]: value };
}

/**
 * `Block` has no "click the dot" interaction (§6's own carve-out) — the
 * play function instead asserts the rendered DOM matches `args`, reading
 * off the real composed anatomy: the container's size, the header's
 * orientation, and the chip's resolved state/tone.
 */
export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const block = canvasElement.querySelector('[data-slot="block"]');
    if (!(block instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="block"] element in the DOM');
    }
    await expect(block.style.width).toBe(`${args.width}px`);
    await expect(block.style.height).toBe(`${args.height}px`);

    const header = canvasElement.querySelector('[data-slot="block-header"]');
    if (!(header instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="block-header"] element in the DOM');
    }
    await expect(header.getAttribute("data-orientation")).toBe(args.orientation);

    const chip = canvasElement.querySelector('[data-slot="block-chip"]');
    if (!(chip instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="block-chip"] element in the DOM');
    }
    await expect(chip.getAttribute("data-state")).toBe(args.state);
    await expect(chip.getAttribute("data-tone")).toBe(args.tone);
    await expect(chip.getAttribute("data-lens")).toBe(args.lens);
    await expect(canvas.getByText("Chip")).toBeInTheDocument();
  },
};

const sweep = (fieldId: string) => ({
  controls: { exclude: controlNames(BLOCK_FIELDS, [fieldId]) },
});

/** Both header layouts, side by side — the one non-bundle segments field. */
export const AllOrientations: Story = {
  parameters: sweep("orientation"),
  render: (args) => (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      {ORIENTATION_FIELD.options!.map((option) => (
        <div key={option.value}>{renderBlock(withField(args, "orientation", option.value))}</div>
      ))}
    </div>
  ),
};

/**
 * Every real `AppearanceState`, read on the chip — proof `state` reaches
 * the chip through the same cascade `Pill` runs, one Block per state.
 */
export const AllStates: Story = {
  parameters: sweep("state"),
  render: (args) => (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      {STATE_FIELD.options!.map((option) => (
        <div key={option.value}>{renderBlock(withField(args, "state", option.value))}</div>
      ))}
    </div>
  ),
};

/** Every real `Tone`, including `neutral` (state drives the chip's paint). */
export const AllTones: Story = {
  parameters: sweep("tone"),
  render: (args) => (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      {TONE_FIELD.options!.map((option) => (
        <div key={option.value}>{renderBlock(withField(args, "tone", option.value))}</div>
      ))}
    </div>
  ),
};

/** Every real `Lens` value from the shared bundle, forwarded to the chip. */
export const AllLenses: Story = {
  parameters: sweep("lens"),
  render: (args) => (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      {LENS_FIELD.options!.map((option) => (
        <div key={option.value}>{renderBlock(withField(args, "lens", option.value))}</div>
      ))}
    </div>
  ),
};

/**
 * The "else inert" half of T1-SPEC.md §4.8's own field-table footnote: no
 * `<BlockChip>` is composed here, so `state`/`tone` (still set in
 * Controls) visibly change nothing — a plain header with no chip region
 * reserved.
 */
export const NoChip: Story = {
  render: (args) => (
    <Block width={args.width} height={args.height}>
      <BlockHeader orientation={args.orientation}>
        <BlockGlyph>◆</BlockGlyph>
        <BlockTitle>Block</BlockTitle>
      </BlockHeader>
      <BlockDescription>No chip composed — state/tone are inert here</BlockDescription>
    </Block>
  ),
};
