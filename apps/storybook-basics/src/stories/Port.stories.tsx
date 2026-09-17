import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { Port, PORT_STATES } from "../components/port";
import { PORT_DIAMETERS } from "../components/port.layout";

/**
 * Gallery scaffolding — a captioned swatch, same convention
 * Bar.stories.tsx's `HeaderLayout` uses: a small label above a dashed-free
 * box so many variants read as one comparison, not N isolated specimens.
 */
function Swatch({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: 96 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 40 }}>{children}</div>
      <span style={{ fontSize: 11, color: "var(--muted-foreground)", textAlign: "center" }}>{caption}</span>
    </div>
  );
}

const meta = {
  title: "Basics/Port",
  component: Port,
  args: { state: "empty", diameter: "md" },
} satisfies Meta<typeof Port>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A single dot at rest. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('[data-slot="port-dot"]');
    if (!(el instanceof HTMLElement)) throw new Error('expected a [data-slot="port-dot"]');
    await expect(el.getAttribute("data-state")).toBe("empty");
  },
};

/**
 * The sketch's own row: Empty · Out of Focus (`dimmed`) · Value Set · Wired
 * (orange ring + orange core) · Data Received (solid green) — one gallery,
 * all five read side by side.
 */
export const AllStates: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 24 }}>
      <Swatch caption="Empty">
        <Port state="empty" />
      </Swatch>
      <Swatch caption="Out of Focus">
        <Port state="empty" dimmed />
      </Swatch>
      <Swatch caption="Value Set">
        <Port state="valueSet" />
      </Swatch>
      <Swatch caption="Wired">
        <Port state="wired" />
      </Swatch>
      <Swatch caption="Data Received">
        <Port state="received" />
      </Swatch>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const dots = canvasElement.querySelectorAll('[data-slot="port-dot"]');
    await expect(dots).toHaveLength(5);
    // Every real PortState renders one dot, in the exact declared order.
    await expect(PORT_STATES).toEqual(["empty", "valueSet", "wired", "received"]);
    const dimmedDot = canvasElement.querySelector('[data-slot="port-dot"][data-dimmed="true"]');
    await expect(dimmedDot).not.toBeNull();
  },
};

/** The three named rungs plus a bare-number "Exact" diameter. */
export const Diameters: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-end" }}>
      <Swatch caption={`Small (${PORT_DIAMETERS.sm}px)`}>
        <Port state="wired" diameter="sm" />
      </Swatch>
      <Swatch caption={`Medium (${PORT_DIAMETERS.md}px)`}>
        <Port state="wired" diameter="md" />
      </Swatch>
      <Swatch caption={`Large (${PORT_DIAMETERS.lg}px)`}>
        <Port state="wired" diameter="lg" />
      </Swatch>
      <Swatch caption="Exact (25px)">
        <Port state="wired" diameter={25} />
      </Swatch>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const dots = Array.from(canvasElement.querySelectorAll('[data-slot="port-dot"]'));
    await expect(dots).toHaveLength(4);
    const widths = dots.map((d) => Math.round((d as HTMLElement).getBoundingClientRect().width));
    await expect(widths).toEqual([PORT_DIAMETERS.sm, PORT_DIAMETERS.md, PORT_DIAMETERS.lg, 25]);
  },
};

/**
 * Zach's own annotation on the sketch: "Completely remove it, we don't want
 * it to be selectable either. If you just set 0 opacity it could not be
 * there but still capture mouse clicks." — so `hidden` is asserted as
 * genuinely ABSENT from the DOM (not merely invisible), and a click at the
 * exact spot the dot would have occupied lands on the backdrop underneath,
 * not on some invisible interactive layer.
 */
export const Hidden: Story = {
  args: { hidden: true, state: "wired" },
  render: (args) => (
    <div
      data-testid="hidden-backdrop"
      style={{ width: 120, height: 120, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--muted)" }}
    >
      <Port {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    // No DOM node at all — not opacity:0, not visibility:hidden.
    await expect(canvasElement.querySelector('[data-slot="port-dot"]')).toBeNull();
    await expect(canvasElement.querySelector('[data-slot="port-dot-halo"]')).toBeNull();

    const backdrop = canvasElement.querySelector('[data-testid="hidden-backdrop"]');
    if (!(backdrop instanceof HTMLElement)) throw new Error("expected the backdrop element");
    const rect = backdrop.getBoundingClientRect();
    // A click at the exact centre — precisely where a visible dot would sit
    // — hits the backdrop itself. Nothing invisible is intercepting it.
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    await expect(hit).toBe(backdrop);
  },
};

/**
 * `hover:scale-110` is a real CSS `:hover`, not a prop (see port.tsx's own
 * WHY — nothing outside the component ever needs to SET hover). No play
 * function here: a JS-dispatched `MouseEvent` does not reliably flip a real
 * browser's `:hover` match, so an automated assertion here would either be
 * a false pass or a flaky one — verified instead with a real pointer hover
 * driven through the browser tool, screenshotted before/after.
 */
export const HoverScale: Story = {
  args: { state: "wired", diameter: "md" },
};
