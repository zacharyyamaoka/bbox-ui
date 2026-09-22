import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { Square } from "lucide-react";

import { Badge } from "./badge";
import { BAR_SIZES, type BarSize } from "./bar";
import {
  BAR_SIZE_TO_BADGE_SIZE,
  BAR_SIZE_TO_BUTTON_SIZE,
  BAR_SIZE_TO_EDITABLE_TEXT_SIZE,
  BAR_SIZE_TO_GLYPH_PRESET,
  BAR_SIZE_TO_TOGGLE_SIZE,
  BarSizeProvider,
  useBarSize,
} from "./barSize";
import { Button } from "./button";
import { EditableText } from "./editableText";
import { Glyph } from "./glyph";
import { Toggle } from "./toggle";

/**
 * src/components/barSize.stories.tsx — the size CASCADE itself, exercised
 * through `BarSizeProvider` DIRECTLY rather than through `Bar`.
 *
 * WHY this exists beside `Bar.stories.tsx`'s own `AllSizes` (which renders
 * the same consumers inside a real `Bar`): that story demonstrates the
 * FEATURE ("a large bar sizes its own contents") and pins the mapping by
 * writing the four rungs out as a literal table in its play function. This
 * one is about the MODULE — it mounts the provider with no `Bar` in sight,
 * proving the cascade is the provider's doing and not something `Bar`
 * computes, and it asserts against `BAR_SIZE_TO_*` themselves, so the
 * oracle IS the exported table. A drift between table and consumer fails
 * here; a drift of BOTH in the same direction is what the literal table in
 * `Bar.stories.tsx` is for. The two are deliberately different oracles.
 *
 * Nothing below passes a `size`/`sizePreset` of its own except
 * `ExplicitSizeWins`, which exists to prove the "explicit beats derived"
 * rule barSize.tsx's own header states.
 */

/** The five consumers of the cascade, each with NO size prop of its own. */
function CascadeCluster() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Glyph content="lucide:rocket" />
      <EditableText>Title</EditableText>
      <Badge variant="secondary">Draft 1</Badge>
      <Button variant="outline">Run</Button>
      <Toggle variant="outline" aria-label="Blackbox">
        <Square />
      </Toggle>
    </div>
  );
}

function Rung({ size, children }: { size: BarSize; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }} data-testid={`rung-${size}`}>
      <span style={{ fontSize: 11, width: 24, color: "var(--muted-foreground)" }}>{size}</span>
      <BarSizeProvider size={size}>{children}</BarSizeProvider>
    </div>
  );
}

/** Reads the cascade the way a consumer does, and renders the raw value —
 *  `undefined` outside any provider is a contract, not an error. */
function BarSizeProbe({ id }: { id: string }) {
  const size = useBarSize();
  return (
    <code data-testid={id} style={{ fontSize: 12 }}>
      {String(size)}
    </code>
  );
}

const meta = {
  title: "Components/Blocks/Bar/Size Cascade",
  tags: ["object:block", "lane:floating-toolbars-2026-09-20"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * One row per rung, the same unsized cluster in each. The play function
 * walks every rung and compares each consumer's resolved `data-size` to the
 * mapping table barSize.tsx exports for it — five tables, four rungs, no
 * literal sizes anywhere in the assertion.
 */
export const CascadeRungs: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {BAR_SIZES.map((size) => (
        <Rung key={size} size={size}>
          <CascadeCluster />
        </Rung>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const size of BAR_SIZES) {
      const rung = canvas.getByTestId(`rung-${size}`);

      await expect(rung.querySelector('[data-slot="glyph"]')?.getAttribute("data-size-preset")).toBe(
        BAR_SIZE_TO_GLYPH_PRESET[size],
      );
      await expect(rung.querySelector('[data-slot="editable-text"]')?.getAttribute("data-size")).toBe(
        BAR_SIZE_TO_EDITABLE_TEXT_SIZE[size],
      );
      await expect(rung.querySelector('[data-slot="badge"]')?.getAttribute("data-size")).toBe(
        BAR_SIZE_TO_BADGE_SIZE[size],
      );
      await expect(rung.querySelector('[data-slot="button"]')?.getAttribute("data-size")).toBe(
        BAR_SIZE_TO_BUTTON_SIZE[size],
      );
      await expect(rung.querySelector('[data-slot="toggle"]')?.getAttribute("data-size")).toBe(
        BAR_SIZE_TO_TOGGLE_SIZE[size],
      );
    }

    // The clamp is the one place the five tables genuinely disagree, and it
    // is the fact worth stating out loud: Button/Toggle have no `xl` rung,
    // so Bar's `xl` lands on their largest (`lg`) — while Glyph/Badge/
    // EditableText, whose ladders match Bar's, keep `xl`.
    await expect(BAR_SIZE_TO_BUTTON_SIZE.xl).toBe(BAR_SIZE_TO_BUTTON_SIZE.lg);
    await expect(BAR_SIZE_TO_BADGE_SIZE.xl).not.toBe(BAR_SIZE_TO_BADGE_SIZE.lg);
    const xl = canvas.getByTestId("rung-xl");
    const lg = canvas.getByTestId("rung-lg");
    await expect(xl.querySelector('[data-slot="button"]')?.getAttribute("data-size")).toBe(
      lg.querySelector('[data-slot="button"]')?.getAttribute("data-size"),
    );
    await expect(xl.querySelector('[data-slot="badge"]')?.getAttribute("data-size")).not.toBe(
      lg.querySelector('[data-slot="badge"]')?.getAttribute("data-size"),
    );
  },
};

/**
 * "An explicit size prop on any child ALWAYS wins" (barSize.tsx's header).
 * Both clusters sit under the SAME `xl` provider; the second one's children
 * each name their own smallest rung.
 */
export const ExplicitSizeWins: Story = {
  render: () => (
    <BarSizeProvider size="xl">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }} data-testid="derived">
          <Glyph content="lucide:rocket" />
          <Badge variant="secondary">Derived</Badge>
          <Button variant="outline">Derived</Button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }} data-testid="explicit">
          <Glyph content="lucide:rocket" sizePreset="sm" />
          <Badge variant="secondary" size="sm">
            Explicit
          </Badge>
          <Button variant="outline" size="sm">
            Explicit
          </Button>
        </div>
      </div>
    </BarSizeProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const derived = canvas.getByTestId("derived");
    const explicit = canvas.getByTestId("explicit");

    await expect(derived.querySelector('[data-slot="glyph"]')?.getAttribute("data-size-preset")).toBe(
      BAR_SIZE_TO_GLYPH_PRESET.xl,
    );
    await expect(derived.querySelector('[data-slot="badge"]')?.getAttribute("data-size")).toBe(
      BAR_SIZE_TO_BADGE_SIZE.xl,
    );
    await expect(derived.querySelector('[data-slot="button"]')?.getAttribute("data-size")).toBe(
      BAR_SIZE_TO_BUTTON_SIZE.xl,
    );

    // Same provider, same rung — the explicit prop is the only difference.
    await expect(explicit.querySelector('[data-slot="glyph"]')?.getAttribute("data-size-preset")).toBe("sm");
    await expect(explicit.querySelector('[data-slot="badge"]')?.getAttribute("data-size")).toBe("sm");
    await expect(explicit.querySelector('[data-slot="button"]')?.getAttribute("data-size")).toBe("sm");

    // Measured, not merely attribute-deep: the derived Glyph really is the
    // bigger box. (Glyph is the one consumer whose footprint is pure
    // geometry, so its rect is a fair ruler; Badge/Button carry text.)
    const derivedGlyph = derived.querySelector('[data-slot="glyph"]');
    const explicitGlyph = explicit.querySelector('[data-slot="glyph"]');
    if (!(derivedGlyph instanceof HTMLElement) || !(explicitGlyph instanceof HTMLElement)) {
      throw new Error('expected two [data-slot="glyph"] elements');
    }
    await expect(derivedGlyph.getBoundingClientRect().width).toBeGreaterThan(
      explicitGlyph.getBoundingClientRect().width,
    );
  },
};

/**
 * The hook's own two states. Outside any provider `useBarSize()` is
 * `undefined` — "not inside a cascade," not an error (barSize.tsx) — which
 * is exactly what lets every consumer fall through to its own floor.
 */
export const OutsideAnyBar: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>no provider · useBarSize() =</span>
        <BarSizeProbe id="probe-outside" />
        <Glyph content="lucide:rocket" data-testid="glyph-outside" />
        <Badge variant="secondary">Floor</Badge>
      </div>
      <BarSizeProvider size="lg">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>inside lg · useBarSize() =</span>
          <BarSizeProbe id="probe-inside" />
          <Glyph content="lucide:rocket" />
          <Badge variant="secondary">Derived</Badge>
        </div>
      </BarSizeProvider>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("probe-outside").textContent).toBe("undefined");
    await expect(canvas.getByTestId("probe-inside").textContent).toBe("lg");

    // No provider: each consumer's OWN documented floor, which is not the
    // same rung for both — Glyph floors at "sm", Badge at "md".
    const outsideGlyph = canvas.getByTestId("glyph-outside");
    await expect(outsideGlyph.getAttribute("data-size-preset")).toBe("sm");
    const badges = canvasElement.querySelectorAll('[data-slot="badge"]');
    await expect(badges[0]?.getAttribute("data-size")).toBe("md");
    // ...and the one under the provider reads the table instead.
    await expect(badges[1]?.getAttribute("data-size")).toBe(BAR_SIZE_TO_BADGE_SIZE.lg);
  },
};
