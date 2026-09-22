import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { OriginBadge, type OriginBadgeSpec } from "./originBadge";
import type { BadgeProps } from "./badge";

/**
 * `OriginBadge` (originBadge.tsx), colocated — the four-state badge a code
 * cell wears: who owns its bytes.
 *
 * WHY the four rows are re-declared below instead of imported from the
 * module that authors them: this file sits in `src/components/`, and
 * `layering.test.ts`'s import wall greps every `.ts`/`.tsx` file in this
 * directory — comments included — for a relative specifier reaching into
 * the scene kit. A story is not exempt from the wall, and it does not need
 * to be: the whole point of `OriginBadge` taking its `spec` as a PROP is
 * that the component is reason-blind, so a fixture standing in for the real
 * table exercises exactly the contract the real caller uses. The canonical
 * rows stay where they are authored; `SpecDrivesThePaint` below is the
 * story that proves nothing here reads the state string.
 */

const DEMO_STATES = ["pseudo", "synced", "drifted", "orphaned"] as const;
type DemoState = (typeof DEMO_STATES)[number];

const DEMO_SPECS: Readonly<Record<DemoState, OriginBadgeSpec>> = {
  pseudo: {
    label: "Pseudo",
    variant: "secondary",
    description: "Nothing backs this cell. The board owns the bytes; edit freely.",
  },
  synced: {
    label: "Synced",
    variant: "outline",
    description: "A file owns these bytes and this cell is a faithful cache of the anchored span.",
  },
  drifted: {
    label: "Drifted",
    variant: "warning",
    description: "The file changed under this cell. Re-read it; never merge silently.",
  },
  orphaned: {
    label: "Orphaned",
    variant: "destructive",
    description: "The file or the anchored definition cannot be found. Re-bind, or detach to a pseudo cell.",
  },
};

const meta = {
  title: "Components/Text & Marks/OriginBadge",
  tags: ["object:text-marks", "lane:baseline"],
  component: OriginBadge,
  args: { state: "synced", spec: DEMO_SPECS.synced },
} satisfies Meta<typeof OriginBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

function badges(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-slot="origin-badge"]'));
}

/** A variant's resolved paint — what a reader actually distinguishes the
 *  four states by. Both halves matter: `outline` is transparent-backed and
 *  differs from the others only in its ink and border. */
function paintSignature(element: HTMLElement): string {
  const style = getComputedStyle(element);
  return `${style.backgroundColor}|${style.color}|${style.borderColor}`;
}

/**
 * All four states, in the order the state machine declares them. The play
 * function pins the three things the component is responsible for —
 * `data-state` published verbatim, the spec's label as the visible text,
 * the spec's description as the hover `title` — and then one thing the
 * component is only responsible for FORWARDING: the four variants really do
 * resolve to four different paints, so the states are told apart by more
 * than their words.
 */
export const FourStates: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      {DEMO_STATES.map((state) => (
        <OriginBadge key={state} state={state} spec={DEMO_SPECS[state]} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const found = badges(canvasElement);
    await expect(found).toHaveLength(DEMO_STATES.length);

    await expect(found.map((badge) => badge.getAttribute("data-state"))).toEqual([...DEMO_STATES]);
    await expect(found.map((badge) => badge.textContent)).toEqual(DEMO_STATES.map((state) => DEMO_SPECS[state].label));
    await expect(found.map((badge) => badge.getAttribute("title"))).toEqual(
      DEMO_STATES.map((state) => DEMO_SPECS[state].description),
    );

    const paints = found.map(paintSignature);
    await expect(new Set(paints).size).toBe(DEMO_STATES.length);
  },
};

/**
 * The contract the component's own header argues for: the spec ARRIVES as a
 * prop, so `OriginBadge` cannot be branching on the state string. Two
 * badges carry the SAME `state="drifted"` and different specs — and they
 * paint differently, which is only possible if the spec is what is being
 * read.
 */
export const SpecDrivesThePaint: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <OriginBadge state="drifted" spec={DEMO_SPECS.drifted} />
      <OriginBadge
        state="drifted"
        spec={{ label: "Out of date", variant: "destructive", description: "A host that grades drift harder." }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [asAuthored, asRegraded] = badges(canvasElement);
    if (!asAuthored || !asRegraded) throw new Error("expected two origin badges");

    // Same published state…
    await expect(asAuthored.getAttribute("data-state")).toBe("drifted");
    await expect(asRegraded.getAttribute("data-state")).toBe("drifted");
    // …different words and different pixels, from the spec alone.
    await expect(asAuthored.textContent).toBe("Drifted");
    await expect(asRegraded.textContent).toBe("Out of date");
    await expect(paintSignature(asAuthored)).not.toBe(paintSignature(asRegraded));
  },
};

const SIZES: NonNullable<BadgeProps["size"]>[] = ["sm", "md", "lg", "xl"];

/**
 * `size` is the one prop `OriginBadge` passes straight through to `Badge`,
 * and a code cell picks a rung by how much room its header has. Measured,
 * not asserted from the class list: identical text at four rungs must get
 * four strictly growing type sizes and four strictly growing boxes.
 */
export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      {SIZES.map((size) => (
        <OriginBadge key={size} state="drifted" spec={DEMO_SPECS.drifted} size={size} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("Drifted")).toHaveLength(SIZES.length);

    const found = badges(canvasElement);
    await expect(found).toHaveLength(SIZES.length);

    const fontSizes = found.map((badge) => parseFloat(getComputedStyle(badge).fontSize));
    const widths = found.map((badge) => badge.getBoundingClientRect().width);
    for (let i = 1; i < SIZES.length; i += 1) {
      await expect(fontSizes[i]).toBeGreaterThan(fontSizes[i - 1]);
      await expect(widths[i]).toBeGreaterThan(widths[i - 1]);
    }
  },
};
