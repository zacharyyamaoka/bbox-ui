import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Badge } from "./badge";

const meta = {
  title: "Basics/Badge",
  tags: ["area:basics", "lane:baseline"],
  component: Badge,
  args: { children: "Badge" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default/secondary/outline/destructive variants, side by side. */
export const Variants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8 }}>
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="destructive">Destructive</Badge>
    </div>
  ),
};

/** "Draft 1" — the exact label the sketch's "w/ Title Badge" header uses,
 *  reused directly in Bar.stories.tsx's HeaderLayouts gallery. */
export const DraftLabel: Story = {
  args: { children: "Draft 1", variant: "secondary" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Draft 1")).toBeInTheDocument();
  },
};

const VARIANTS = ["default", "secondary", "outline", "destructive"] as const;

/**
 * A-1 (docs/FEEDBACK-2026-09-17b-PLAN.md): every variant in both shapes,
 * side by side, so shape is the only variable. `shape="pill"` is opt-in —
 * see badge.tsx's own WHY — so `Rounded` below is the untouched default.
 */
export const PillShape: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, width: 60, color: "var(--muted-foreground)" }}>rounded</span>
        {VARIANTS.map((variant) => (
          <Badge key={variant} variant={variant} data-testid={`rounded-${variant}`}>
            {variant}
          </Badge>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, width: 60, color: "var(--muted-foreground)" }}>pill</span>
        {VARIANTS.map((variant) => (
          <Badge key={variant} variant={variant} shape="pill" data-testid={`pill-${variant}`}>
            {variant}
          </Badge>
        ))}
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    // A-1a: `shape="pill"` computes to a fully-round radius (>= half the
    // box's own height — the standard "is this a pill" test, not a single
    // magic px number that would drift with padding/size); the default
    // (no `shape`) computes the SAME radius main did before this change.
    // The reference below renders the bare `rounded-md` utility directly
    // (not a hardcoded px guess) — badge.tsx's WHY says the rounded shape
    // is exactly that class, unchanged, so this is the "same as main
    // today" comparison, immune to whatever this app's radius scale is.
    const reference = document.createElement("span");
    reference.className = "rounded-md";
    canvasElement.appendChild(reference);
    const roundedMdRadius = getComputedStyle(reference).borderRadius;
    reference.remove();

    for (const variant of VARIANTS) {
      const rounded = canvasElement.querySelector(`[data-testid="rounded-${variant}"]`);
      const pill = canvasElement.querySelector(`[data-testid="pill-${variant}"]`);
      if (!(rounded instanceof HTMLElement) || !(pill instanceof HTMLElement)) {
        throw new Error(`expected both rounded/pill badges for ${variant}`);
      }
      await expect(getComputedStyle(rounded).borderRadius).toBe(roundedMdRadius);
      const pillRadius = parseFloat(getComputedStyle(pill).borderRadius);
      const pillHeight = pill.getBoundingClientRect().height;
      await expect(pillRadius).toBeGreaterThanOrEqual(pillHeight / 2);
    }
  },
};

/**
 * A-1b: SystemSketch's own real marks, not lorem — `z-1` is a layer,
 * `mut`/`iter` are the cable-pill marks from `cablePillLabel`, `Draft` is
 * the block state. Both shapes, all four `size` rungs — doubles as the
 * size-cascade check.
 */
const VOCAB = ["Draft", "z-1", "mut", "iter"] as const;
const SIZES = ["sm", "md", "lg", "xl"] as const;

export const SystemVocabulary: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {(["rounded", "pill"] as const).map((shape) => (
        <div key={shape} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>shape={shape}</span>
          {SIZES.map((size) => (
            <div key={size} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, width: 24, color: "var(--muted-foreground)" }}>{size}</span>
              {VOCAB.map((label) => (
                <Badge key={label} variant="secondary" shape={shape} size={size}>
                  {label}
                </Badge>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const label of VOCAB) {
      await expect(canvas.getAllByText(label).length).toBe(SIZES.length * 2); // 2 shapes
    }
  },
};
