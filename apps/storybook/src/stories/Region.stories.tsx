import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { controlNames, defaultArgs, toArgTypes } from "@bbox-ui/schema";
import {
  BlockFace,
  Region,
  REGION_FIELDS,
  REGION_KINDS,
  REGION_PRESETS,
  type BlockFaceData,
  type RegionKind,
} from "@bbox-ui/core";
import type { ComponentType } from "react";

/**
 * Region = For / While / If (region.tsx): a bordered container with a REAL
 * `Block` — composed by the caller, in Port view — riding its corner
 * (region.presets.ts's own C7 ruling, Zach's words: "a region is not a
 * block but is composed using a block"). `REGION_PRESETS` is deliberately
 * empty (no `view` selector of its own), so unlike `Block.stories.tsx`
 * there is no `Presets` gallery here — every `segments` field still gets
 * its own sweep (`AllKinds`, `Block.stories.tsx`'s own `AllOrientations`
 * pattern).
 *
 * `argTypes`/`args` are GENERATED from `REGION_FIELDS`
 * (packages/bbox-ui/src/region.fields.ts). `RegionStoryArgs` is declared by
 * hand rather than inferred from `ComponentProps<typeof Region>`, matching
 * `Block.stories.tsx`'s own deviation: `meta.render` also has to compose a
 * `corner` and body `children`, which are structural JSX, not `FieldSpec`
 * rows.
 */
interface RegionStoryArgs {
  kind: RegionKind;
  width: number;
  height: number;
  radius: number;
}

// A small, real Block face for the corner — one input, one output is
// enough to prove the corner is a functioning Block (C7) without turning
// this into a second Block port-layout story.
const CORNER_DATA: BlockFaceData = {
  title: "for",
  ports: [
    { id: "corner-in", direction: "input", name: "in" },
    { id: "corner-out", direction: "output", name: "out" },
  ],
};

// Kept austere (border + label, no paint fields) — matches
// Block.stories.tsx's own memberBox: just enough to prove the body slot
// paints real children.
function bodyMember(label: string) {
  return (
    <div
      key={label}
      style={{ border: "1px solid currentColor", borderRadius: 4, padding: "4px 8px", fontSize: 12 }}
    >
      {label}
    </div>
  );
}

function renderRegion(args: RegionStoryArgs) {
  return (
    <Region
      kind={args.kind}
      width={args.width}
      height={args.height}
      radius={args.radius}
      // WHY the scale: region.tsx's own corner wrapper only translates
      // (-30%, -40%) — it never shrinks the corner. A Port-view Block
      // defaults to 384x346 (block.view.ts's BLOCK_VIEW_DEFAULT_SIZES),
      // which is close to this story's own 560x360 region and visually
      // swallows it unscaled. Scaling the BlockFace itself (not the
      // wrapper, which region.tsx owns) keeps the corner legibly a corner.
      corner={<BlockFace view="port" data={CORNER_DATA} style={{ transform: "scale(0.6)", transformOrigin: "top left" }} />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {bodyMember("Body Member")}
        {bodyMember("Body Member")}
      </div>
    </Region>
  );
}

const meta = {
  title: "Components/Region",
  component: Region as unknown as ComponentType<RegionStoryArgs>,
  args: defaultArgs(REGION_FIELDS, REGION_PRESETS) as unknown as RegionStoryArgs,
  argTypes: toArgTypes(REGION_FIELDS),
  render: renderRegion,
} satisfies Meta<RegionStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The play function reads C7 off the real DOM: not just that a `kind`
 * attribute landed, but that the corner is a genuine `BlockFace` in Port
 * view — carrying real port ids — rather than a decorative stand-in.
 */
export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const region = canvasElement.querySelector('[data-slot="region"]');
    if (!(region instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="region"] element in the DOM');
    }
    await expect(region.getAttribute("data-kind")).toBe(args.kind);

    const corner = canvasElement.querySelector('[data-slot="region-corner"] [data-view="port"]');
    if (!(corner instanceof HTMLElement)) {
      throw new Error('expected the region corner to contain a [data-view="port"] Block');
    }
    const cornerPorts = corner.querySelectorAll("[data-port-id]");
    await expect(cornerPorts.length).toBe(CORNER_DATA.ports!.length);
    await expect(canvas.getByText("for")).toBeInTheDocument();
  },
};

const sweep = (fieldId: string) => ({
  controls: { exclude: controlNames(REGION_FIELDS, [fieldId]) },
});

/** Every real `RegionKind`, side by side — Block.stories.tsx's own
 * `AllOrientations` pattern, swept over `REGION_KINDS` rather than a
 * hand-picked subset so a fourth kind shows up here for free. */
export const AllKinds: Story = {
  parameters: sweep("kind"),
  render: (args) => (
    <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>
      {REGION_KINDS.map((kind) => (
        <div key={kind}>{renderRegion({ ...args, kind })}</div>
      ))}
    </div>
  ),
};
