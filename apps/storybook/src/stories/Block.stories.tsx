import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { controlNames, defaultArgs, toArgTypes, type FieldValue } from "@bbox-ui/schema";
import {
  Block,
  BlockChip,
  BlockDescription,
  BlockFace,
  BlockGlyph,
  BlockHeader,
  BlockTitle,
  BlockType,
  BLOCK_FIELDS,
  BLOCK_PRESETS,
  BLOCK_VIEWS,
  BLOCK_VIEW_LABELS,
  type AppearanceState,
  type BlockFaceData,
  type BlockHeaderMode,
  type BlockMembersMode,
  type BlockOrientation,
  type BlockPortsMode,
  type BlockTypePlacement,
  type BlockView,
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
  // `view` and the six face fields it governs (block.fields.ts) — added so
  // `defaultArgs(BLOCK_FIELDS, BLOCK_PRESETS)` below still typechecks now
  // that BLOCK_FIELDS carries them. `renderBlock`'s legacy anatomy ignores
  // every one of these; the `Views`/`PortFaceOverride` stories further down
  // compose the real `BlockFace` and are where they actually act.
  view: BlockView;
  header: BlockHeaderMode;
  ports: BlockPortsMode;
  members: BlockMembersMode;
  description: boolean;
  typePlacement: BlockTypePlacement;
  footer: boolean;
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

/* ------------------------------------------------------------------ */
/* BlockFace — P2 "views are presets" (block.presets.ts, blockFace.tsx) */
/* ------------------------------------------------------------------ */

// One demo record shared by every face story below — three ports (two in,
// one out) is enough to prove identity survives a view switch (C3) without
// a wall/row story turning into a stress test of port-count layout, which
// port.stories.tsx already owns.
const FACE_DATA: BlockFaceData = {
  title: "Block",
  typeLabel: "Type",
  description: "Description",
  icon: "◆",
  tag: "Chip",
  ports: [
    { id: "in-a", direction: "input", name: "alpha", typeLabel: "Pose" },
    { id: "in-b", direction: "input", name: "beta", typeLabel: "Mask" },
    { id: "out-c", direction: "output", name: "gamma", typeLabel: "Goal" },
  ],
};

// Kept austere (border + label, no paint fields) — the members region only
// needs to be a real, visually distinct child to prove "shown" mounts it.
function memberBox(label: string) {
  return (
    <div
      key={label}
      style={{ border: "1px solid currentColor", borderRadius: 4, padding: "4px 8px", fontSize: 12 }}
    >
      {label}
    </div>
  );
}

const MEMBERS_CONTENT = (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {memberBox("Child Member")}
    {memberBox("Child Member")}
  </div>
);

/**
 * All three views side by side — `BLOCK_VIEWS`, never a hand-picked
 * subset, so a fourth view added to `block.view.ts` shows up here for
 * free. The play function is C3's own worked proof: ports keep the exact
 * same id set across every view, even though only Port/Expanded paint
 * them.
 */
export const Views: Story = {
  parameters: { controls: { exclude: controlNames(BLOCK_FIELDS, ["view"]) } },
  render: () => (
    <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>
      {BLOCK_VIEWS.map((view) => (
        <div key={view} style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12 }}>{BLOCK_VIEW_LABELS[view]}</span>
          <BlockFace view={view} data={FACE_DATA} membersContent={MEMBERS_CONTENT} />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const faces = Array.from(canvasElement.querySelectorAll("[data-view]"));
    await expect(faces.length).toBe(3);
    const seenViews = new Set(faces.map((face) => face.getAttribute("data-view")));
    await expect(seenViews).toEqual(new Set(BLOCK_VIEWS));

    // Same id set on every face — a view switch never drops or renames a
    // port, only how (or whether) it paints.
    const expectedIds = new Set(FACE_DATA.ports!.map((port) => port.id));
    for (const face of faces) {
      const ids = Array.from(face.querySelectorAll("[data-port-id]")).map((el) =>
        el.getAttribute("data-port-id"),
      );
      await expect(new Set(ids)).toEqual(expectedIds);
    }

    const simpleFace = canvasElement.querySelector('[data-view="simple"]');
    if (!(simpleFace instanceof HTMLElement)) {
      throw new Error('expected a [data-view="simple"] element in the DOM');
    }
    for (const port of Array.from(simpleFace.querySelectorAll("[data-port-id]"))) {
      await expect(getComputedStyle(port).visibility).toBe("hidden");
    }

    for (const view of ["port", "expanded"] as const) {
      const face = canvasElement.querySelector(`[data-view="${view}"]`);
      if (!(face instanceof HTMLElement)) {
        throw new Error(`expected a [data-view="${view}"] element in the DOM`);
      }
      for (const port of Array.from(face.querySelectorAll("[data-port-id]"))) {
        await expect(getComputedStyle(port).visibility).not.toBe("hidden");
      }
    }

    // Only Expanded mounts the members region — Simple/Port resolve
    // `members: "hidden"` and MEMBERS_RENDER paints nothing for it.
    const membersRegions = canvasElement.querySelectorAll('[data-slot="block-face-members"]');
    await expect(membersRegions.length).toBe(1);
    await expect(membersRegions[0].closest("[data-view]")?.getAttribute("data-view")).toBe("expanded");
  },
};

/**
 * The report's own worked example (P2, reports/view-switching-proposals-
 * 2026-09-11.html): an instance override composes OVER the preset rather
 * than replacing it wholesale. Both faces resolve `view="port"`; only the
 * right one also sets `footer={false}` as an override, so its footer Bar
 * disappears while every other governed field (header/ports/members/…)
 * still comes from the "port" preset untouched.
 */
export const PortFaceOverride: Story = {
  parameters: { controls: { exclude: controlNames(BLOCK_FIELDS, ["view", "footer"]) } },
  render: () => (
    <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12 }}>Preset (footer: true)</span>
        <BlockFace view="port" data={FACE_DATA} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12 }}>Override (footer: false)</span>
        <BlockFace view="port" footer={false} data={FACE_DATA} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const faces = canvasElement.querySelectorAll('[data-view="port"]');
    await expect(faces.length).toBe(2);
    const [presetFace, overriddenFace] = Array.from(faces);
    await expect(presetFace.querySelector('[data-slot="bar"][data-edge="top"]')).not.toBeNull();
    await expect(overriddenFace.querySelector('[data-slot="bar"][data-edge="top"]')).toBeNull();
  },
};

// No `ParkedSizes` story: `parkViewSize` (block.view.ts) is a pure data
// helper with no DOM to paint — it already has its own unit coverage in
// packages/bbox-ui, so a Storybook story would only re-assert the same
// thing through a slower, DOM-shaped lens.
