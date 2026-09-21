import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Square } from "lucide-react";

import { Toggle } from "./toggle";

/**
 * The "blackbox toggle" — shadcn's Toggle (ai-comment:chevron-blackbox-
 * toggle-shadcn-picks-2026-09-16): no label, no track-and-thumb, an
 * icon-button with a pressed/unpressed visual state.
 *
 * Decided 2026-09-16, superseding the earlier `Square`/`SquareCheck` pair
 * (that was an eyeballed guess, flagged at the time — no stock lucide
 * "hollow square / filled square" pair exists): ONE lucide `Square`,
 * `fill="none"` when off, `fill="currentColor"` when on. Zach's own sketch
 * is the same square at the same size, hollow then filled — not two
 * different glyphs.
 */
function BlackboxSquare({ pressed }: { pressed: boolean }) {
  return <Square fill={pressed ? "currentColor" : "none"} />;
}

function ControlledToggle({ size, variant }: { size?: "sm" | "default" | "lg"; variant?: "default" | "outline" }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Toggle
      size={size}
      variant={variant}
      pressed={pressed}
      onPressedChange={setPressed}
      aria-label="Blackbox"
    >
      <BlackboxSquare pressed={pressed} />
    </Toggle>
  );
}

const meta = {
  title: "Basics/Toggle",
  tags: ["area:basics", "lane:baseline"],
  component: Toggle,
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Off/on states, side by side (uncontrolled `defaultPressed`). */
export const States: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8 }}>
      <Toggle aria-label="Off" size="sm" variant="outline">
        <BlackboxSquare pressed={false} />
      </Toggle>
      <Toggle aria-label="On" size="sm" variant="outline" defaultPressed>
        <BlackboxSquare pressed />
      </Toggle>
    </div>
  ),
};

/** `size="sm" variant="outline"` — the small square icon-button-in-a-corner
 *  look from the sketch's "w/ various other tools" header — clicked, proving
 *  the pressed state actually flips. */
export const Interactive: Story = {
  render: () => <ControlledToggle size="sm" variant="outline" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: "Blackbox" });
    await expect(toggle.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(toggle);
    await expect(toggle.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(toggle);
    await expect(toggle.getAttribute("aria-pressed")).toBe("false");
  },
};

/**
 * Zach's explicit ask: "For the toggle please show a story for the
 * blackbox toggle. Its empty box when in whitebox mode and then a filled
 * box when in blackbox mode." His sketch is a hollow square outline and a
 * solid filled square — the SAME square at the SAME size. This shows the
 * static off/on pair plus a live control the play function actually
 * clicks, asserting both `aria-pressed` AND the rendered SVG's `fill`
 * change — not just the state flag.
 */
export const BlackboxToggle: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <Toggle aria-label="Whitebox" variant="outline">
          <BlackboxSquare pressed={false} />
        </Toggle>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Whitebox</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <Toggle aria-label="Blackbox (on)" variant="outline" defaultPressed>
          <BlackboxSquare pressed />
        </Toggle>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Blackbox</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <ControlledToggle variant="outline" />
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Click me</span>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: "Blackbox" });
    const svg = toggle.querySelector("svg");
    if (!svg) throw new Error("expected the Square glyph to render inside the toggle");

    await expect(toggle.getAttribute("aria-pressed")).toBe("false");
    await expect(svg.getAttribute("fill")).toBe("none");

    await userEvent.click(toggle);
    await expect(toggle.getAttribute("aria-pressed")).toBe("true");
    await expect(svg.getAttribute("fill")).toBe("currentColor");

    await userEvent.click(toggle);
    await expect(toggle.getAttribute("aria-pressed")).toBe("false");
    await expect(svg.getAttribute("fill")).toBe("none");
  },
};
