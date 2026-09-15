import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { controlNames, defaultArgs, toArgTypes } from "@bbox-ui/schema";
import {
  PORT_DIAMETERS,
  PORT_RING_OVERHANG_PX,
  PORT_SECONDARY_SLOT_GAP_PX,
  Port,
  PORT_FIELDS,
  PORT_PRESETS,
  PortDot,
  portLabelGap,
  portLabelPlacement,
  type AppearanceState,
  type BlockSide,
  type Lens,
  type PortDirection,
  type PortReveal,
  type PortSize,
  type PortTextLayout,
  type PortTextSize,
  type SecondarySlotLayout,
  type Tone,
} from "@bbox-ui/core";
import type { ComponentProps } from "react";

/**
 * T1 Lane P: the REBUILT Port, end to end — now with the two-slot
 * proposal's two independently-positioned slots (2026-09-12). `argTypes`/
 * `args` below are GENERATED from `PORT_FIELDS`
 * (packages/bbox-ui/src/port.fields.ts) — the SAME array the generic
 * product inspector (demos/inspector) reads. Add a field there and both
 * surfaces pick it up; nothing here is kept in sync by hand.
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
 *
 * WHY every story below sets `children` (was `name`/`type`) — those two
 * props are GONE (folded into `children`, the label slot's whole
 * `CodeField` value; see port.tsx's own module doc). Every gallery that
 * used to do `name={(args.name as string) || option.label}` now does the
 * identical thing against `children`.
 */
const meta = {
  title: "Components/Port",
  component: Port,
  args: defaultArgs(PORT_FIELDS, PORT_PRESETS) as Partial<ComponentProps<typeof Port>>,
  argTypes: toArgTypes(PORT_FIELDS),
} satisfies Meta<typeof Port>;

export default meta;

type Story = StoryObj<typeof meta>;

const DIRECTION_FIELD = PORT_FIELDS.find((f) => f.id === "direction")!;
const EDGE_FIELD = PORT_FIELDS.find((f) => f.id === "edge")!;
const DIAMETER_FIELD = PORT_FIELDS.find((f) => f.id === "diameter")!;
const TEXT_LAYOUT_FIELD = PORT_FIELDS.find((f) => f.id === "textLayout")!;
const TEXT_SIZE_FIELD = PORT_FIELDS.find((f) => f.id === "textSize")!;
const STATE_FIELD = PORT_FIELDS.find((f) => f.id === "state")!;
const TONE_FIELD = PORT_FIELDS.find((f) => f.id === "tone")!;
const LENS_FIELD = PORT_FIELDS.find((f) => f.id === "lens")!;
const REVEAL_FIELD = PORT_FIELDS.find((f) => f.id === "reveal")!;
const SECONDARY_SLOT_LAYOUT_FIELD = PORT_FIELDS.find((f) => f.id === "secondarySlotLayout")!;

/**
 * THE STORY THAT CARRIES THE PLAY FUNCTION. Click the painted dot —
 * reachable whether this DOM node sits three frameworks deep (plain div,
 * a React Flow node, a tldraw HTMLContainer shape) by the time this runs
 * — then assert the label's real CodeField mounted with the right value
 * and the dot's `data-state` matches the args this story was actually
 * rendered with. `PORT_FIELDS`' own `children` default is an empty string
 * (nothing real to click through to), so this story overrides it to a
 * realistic one-line signature without touching the field defaults
 * everything else in this file relies on.
 */
export const Primary: Story = {
  args: { children: "frameImage: Image" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const dot = canvasElement.querySelector('[data-slot="port-dot"]');
    if (!(dot instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="port-dot"] element in the DOM');
    }
    await userEvent.click(dot);
    const field = canvasElement.querySelector('[data-testid="port-label-field"]');
    if (!(field instanceof HTMLElement)) {
      throw new Error('expected a [data-testid="port-label-field"] CodeField in the DOM');
    }
    await expect(canvas.getByText(String(args.children))).toBeInTheDocument();
    await expect(dot.getAttribute("data-state")).toBe(args.state);
  },
};

/**
 * A gallery story sweeps ONE field and takes every other field from `args`,
 * so the Controls panel still drives it live. The swept field's own control
 * is disabled, because a story that paints every value at once cannot honour
 * a single control value and a control that silently does nothing reads as
 * broken (Zach, 2026-09-10: "the controls didn't work for the other
 * things"). Every row's `children` falls back to the swept option's own
 * label when Controls hasn't set one, so a field with no visual effect of
 * its own (`lens`, today — docs/T1-SPEC.md §3 defines no lens paint
 * tokens yet) still reads as doing something.
 */
const sweep = (fieldId: string) => ({
  controls: { exclude: controlNames(PORT_FIELDS, [fieldId]) },
});

const galleryRow = { display: "flex", flexDirection: "column" as const, gap: 16 };
const galleryRowInline = { display: "flex", alignItems: "center" as const, gap: 24, flexWrap: "wrap" as const };

/** Every real AppearanceState (docs/T1-SPEC.md §3, narrowed 2026-09-12 to
 * the value axis) — including runtime-only `received`. `wired`/`received`
 * light the small inner core; see the `Hidden` story for the separate,
 * author-set `hidden` toggle this gallery deliberately does not sweep. */
export const AllStates: Story = {
  parameters: sweep("state"),
  render: (args) => (
    <div style={galleryRow}>
      {STATE_FIELD.options!.map((option) => (
        <Port
          {...args}
          key={option.value}
          state={option.value as AppearanceState}
          children={(args.children as string) || option.label}
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
          children={(args.children as string) || option.label}
        />
      ))}
    </div>
  ),
};

/** input vs output — no longer reorders the label's CONTENT (one free-typed
 * string has nothing left to mirror), but still sets which way the
 * `CodeField`'s text aligns (`PortLabel`'s own doc). */
export const AllDirections: Story = {
  parameters: sweep("direction"),
  render: (args) => (
    <div style={galleryRowInline}>
      {DIRECTION_FIELD.options!.map((option) => (
        <Port
          {...args}
          key={option.value}
          direction={option.value as PortDirection}
          children={(args.children as string) || option.label}
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
          children={(args.children as string) || option.label}
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
          children={(args.children as string) || option.label}
        />
      ))}
    </div>
  ),
};

/**
 * Every real label-slot `PortTextLayout` — six now (the two-slot
 * proposal, 2026-09-12, re-added `rightOffset`/`leftOffset` on top of the
 * `top`/`bot`/`right`/`left` PORT-SPEC.md §3f had narrowed this to). The
 * two "Offset" rows sit visibly further from the dot than their plain
 * counterpart (`PORT_LABEL_OFFSET_EXTRA_PX`, port.layout.ts).
 */
export const AllTextLayouts: Story = {
  parameters: sweep("textLayout"),
  render: (args) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 32, padding: 24 }}>
      {TEXT_LAYOUT_FIELD.options!.map((option) => (
        <Port
          {...args}
          key={option.value}
          textLayout={option.value as PortTextLayout}
          children={(args.children as string) || option.label}
        />
      ))}
    </div>
  ),
};

/** Every real PortTextSize rung (18/24/36/44px) — Port's own ladder,
 * deliberately separate from `layout.ts`'s `TEXT_SIZES` (docs/T1-SPEC.md
 * §0). Now also the label `CodeField`'s own font size (`PortLabel`'s
 * `style={{ fontSize: ... }}`, port.tsx). */
export const AllTextSizes: Story = {
  parameters: sweep("textSize"),
  render: (args) => (
    <div style={galleryRowInline}>
      {TEXT_SIZE_FIELD.options!.map((option) => (
        <Port
          {...args}
          key={option.value}
          textSize={option.value as PortTextSize}
          children={(args.children as string) || option.label}
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
          children={(args.children as string) || option.label}
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
          children={(args.children as string) || option.label}
        />
      ))}
    </div>
  ),
};

/** `producers >= 2` composes `PortCountBadge` as the secondary slot's
 * default content (unchanged threshold — the two-slot proposal moved
 * WHERE/HOW it's positioned and composed, not the count that triggers it). */
export const ManyProducers: Story = {
  args: { children: "pose", direction: "output", producers: 3 },
};

/**
 * The 2026-09-12 D5 fix carried forward: the count badge used to carry a
 * FIXED offset (assuming the label always flows right), so a left-flowing
 * label landed almost exactly where the badge sat. Both rows below carry
 * `producers: 3`; the badge's secondary slot now defaults via
 * `defaultSecondarySlotLayout(textLayout)` — the corner OPPOSITE the
 * label — so it stays clear of the text in either layout.
 */
export const ManyProducersEitherLayout: Story = {
  parameters: sweep("textLayout"),
  args: { children: "get_aruco", producers: 3 },
  render: (args) => (
    <div style={galleryRow}>
      <Port {...args} textLayout="right" />
      <Port {...args} textLayout="left" />
    </div>
  ),
};

/**
 * The two-slot proposal's own new axis: `secondarySlotLayout` is now
 * independent of the label's flow side — every row below fixes
 * `textLayout="right"` (label always flows the same way) while sweeping
 * where the producer-count badge sits across all four of its own corners,
 * hugging the dot more tightly than the label slot's own "Offset"
 * positions (`PORT_SECONDARY_SLOT_GAP_PX` < `PORT_LABEL_GAP`,
 * port.layout.ts).
 */
export const AllSecondarySlotLayouts: Story = {
  parameters: sweep("secondarySlotLayout"),
  args: { children: "pose", producers: 3, textLayout: "right" },
  render: (args) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 32, padding: 24 }}>
      {SECONDARY_SLOT_LAYOUT_FIELD.options!.map((option) => (
        <Port
          {...args}
          key={option.value}
          secondarySlotLayout={option.value as SecondarySlotLayout}
        />
      ))}
    </div>
  ),
};

/** A dotted gray box standing in for either slot's real content —
 * neither slot has an intrinsic size of its own (the label sizes to its
 * CodeField text, the secondary slot to whatever a host puts there), so
 * this is a fixed placeholder purely to make the SLOT's position/gap
 * checkable without a badge or label text competing for attention. */
const SLOT_OUTLINE_STYLE = {
  border: "1px dotted gray",
  boxSizing: "border-box" as const,
};
const LABEL_SLOT_SIZE = { width: 64, height: 20 };
const SECONDARY_SLOT_SIZE = { width: 16, height: 16 };
/** How far below the dot's own box a caption has to start to clear the
 * outline box in EITHER direction (a "top"/"bot" pair, or "topOffset"/
 * "botOffset", is symmetric around the dot) — derived from the same
 * constants the real geometry uses, not eyeballed, so a future gap/size
 * change here can't silently reintroduce the overlap the first pass of
 * this story actually had (caption text under the "bot"/"botOffset"
 * boxes, caught by measuring DOM rects, not by looking at a screenshot). */
const LABEL_CAPTION_GAP = PORT_RING_OVERHANG_PX + portLabelGap("rightOffset") + LABEL_SLOT_SIZE.height + 8;
const SECONDARY_CAPTION_GAP = PORT_RING_OVERHANG_PX + PORT_SECONDARY_SLOT_GAP_PX + SECONDARY_SLOT_SIZE.height + 8;

/** One dot + one dotted label-slot box, positioned via the REAL
 * `portLabelPlacement` (port.layout.ts) — the exact function a
 * wall-anchored host calls, and the one `PORT_RING_OVERHANG_PX` (the
 * "measure from the painted ring" fix) flows through. Bypasses
 * `Port`/`PortLabel` entirely since their label content is locked to a
 * `CodeField` string now — this draws the SLOT, not what's in it. */
function LabelSlotSpecimen({ layout }: { layout: PortTextLayout }) {
  const diameterPx = PORT_DIAMETERS.md;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", width: diameterPx, height: diameterPx }}>
        <PortDot diameter="md" />
        <div
          style={{
            position: "absolute",
            ...portLabelPlacement(layout, { w: diameterPx, h: diameterPx }),
            ...LABEL_SLOT_SIZE,
            ...SLOT_OUTLINE_STYLE,
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: "gray", marginTop: LABEL_CAPTION_GAP }}>{layout}</span>
    </div>
  );
}

/** One dot + one dotted secondary-slot box, via the REAL `secondarySlot`/
 * `secondarySlotLayout` props on `PortDot` — the exact mechanism
 * `SECONDARY_SLOT_STYLE` (port.tsx) positions, not a reimplementation. */
function SecondarySlotSpecimen({ layout }: { layout: SecondarySlotLayout }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <PortDot
        diameter="md"
        secondarySlotLayout={layout}
        secondarySlot={<div style={{ ...SECONDARY_SLOT_SIZE, ...SLOT_OUTLINE_STYLE }} />}
      />
      <span style={{ fontSize: 11, color: "gray", marginTop: SECONDARY_CAPTION_GAP }}>{layout}</span>
    </div>
  );
}

/**
 * Slot GEOMETRY, not slot CONTENT — every real position of both slots,
 * each drawn as a plain dotted-gray box instead of a label/badge, so the
 * position/gap/ring-clearance is checkable on its own (Zach, 2026-09-14,
 * post-merge: "I am not confident that this is done correctly"). Same
 * six `PortTextLayout` / four `SecondarySlotLayout` enums the other
 * galleries above sweep, reused here rather than a hand-typed list so
 * this can't silently fall out of sync with a future position.
 */
export const SlotOutlineGeometry: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 56, padding: "24px 40px" }}>
      <div>
        <h4 style={{ margin: "0 0 48px", fontSize: 13, color: "gray" }}>Label slot — every position</h4>
        {/* WHY 48px top gap on the row, not the h4: the "top" specimen's
         * box sits ABOVE its dot (portLabelPlacement's `bottom: Npx`), so
         * without headroom it draws straight over the caption above it —
         * exactly what the first pass of this story did. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 40 }}>
          {TEXT_LAYOUT_FIELD.options!.map((option) => (
            <LabelSlotSpecimen key={option.value} layout={option.value as PortTextLayout} />
          ))}
        </div>
      </div>
      <div>
        <h4 style={{ margin: "0 0 32px", fontSize: 13, color: "gray" }}>Secondary slot — every position</h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 40 }}>
          {SECONDARY_SLOT_LAYOUT_FIELD.options!.map((option) => (
            <SecondarySlotSpecimen key={option.value} layout={option.value as SecondarySlotLayout} />
          ))}
        </div>
      </div>
    </div>
  ),
};

/**
 * Both slots at once, on a realistic port: the label slot's real
 * `CodeField` holding a `name: Type` one-liner, the secondary slot's
 * producer-count badge sitting in the free corner — the two-slot
 * proposal's actual money shot, not two separate galleries.
 */
export const TwoSlotsTogether: Story = {
  args: { children: "get_aruco: ArucoSrv", direction: "output", producers: 3, state: "wired" },
};

/** `hidden: true` renders nothing at all — a container rolls it into its
 * own `+N more` summary (`PortHiddenSummary`, exported from `./port.tsx`,
 * not exercised as a standalone story: it is the CONTAINER's part, not
 * one Port's). Replaces the old `state: "hidden"` rung — see
 * appearance.ts's own WHY for the split. */
export const Hidden: Story = {
  args: { children: "hiddenPort", hidden: true },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-slot="port"]')).toBeNull();
  },
};
