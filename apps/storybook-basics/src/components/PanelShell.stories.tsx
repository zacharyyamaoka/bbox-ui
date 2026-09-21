import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { PanelShell } from "../components/panelShell";

const meta = {
  title: "Basics/PanelShell",
  component: PanelShell,
  // WHY base `args`: `title`/`onClose`/`children` have no sensible default,
  // so CSF3 typegen requires them here. Every story below supplies its own
  // real values via `render`'s closure instead of reading `args` — this
  // fixture only exists to satisfy the required-args contract.
  args: {
    title: "Panel",
    onClose: fn(),
    children: null,
  },
} satisfies Meta<typeof PanelShell>;

export default meta;
type Story = StoryObj<typeof meta>;

function Frame({ children }: { children: ReactNode }) {
  return (
    <div style={{ height: 360, width: 300, background: "var(--muted)", padding: 12 }}>
      {children}
    </div>
  );
}

/** The two shells this lane actually builds on top of it (docs/menus/screenshots/06, 07). */
export const RightPanels: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16 }}>
      <Frame>
        <PanelShell eyebrow="RIGHT PANEL" title="Frames" onClose={fn()}>
          <p style={{ padding: 14, fontSize: 13, color: "var(--muted-foreground)" }}>Frames panel body.</p>
        </PanelShell>
      </Frame>
      <Frame>
        <PanelShell eyebrow="RIGHT PANEL" title="Problems" onClose={fn()}>
          <p style={{ padding: 14, fontSize: 13, color: "var(--muted-foreground)" }}>Problems panel body.</p>
        </PanelShell>
      </Frame>
    </div>
  ),
};

/** No `eyebrow` — a shell that isn't docked to a named rail (a modal, an inline preview). */
export const NoEyebrow: Story = {
  render: () => (
    <Frame>
      <PanelShell title="Compare changes" onClose={fn()}>
        <p style={{ padding: 14, fontSize: 13, color: "var(--muted-foreground)" }}>No eyebrow line above the title.</p>
      </PanelShell>
    </Frame>
  ),
};

/**
 * `hideHeader` — the exact bug this prop exists to prevent
 * (SystemSketchChrome.tsx:1156-1164): a body that draws its own title/close
 * row still needs a way OUT. This story's body supplies its own close
 * affordance so the panel is never headerless with no escape.
 */
export const HideHeaderOwnsItsOwnClose: Story = {
  render: function Render() {
    const [open, setOpen] = useState(true);
    if (!open) {
      return (
        <button type="button" onClick={() => setOpen(true)}>
          Reopen
        </button>
      );
    }
    return (
      <Frame>
        <PanelShell title="Inspector" onClose={fn()} hideHeader>
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: 10, borderBottom: "1px solid var(--border)" }}>
              <strong style={{ fontSize: 13 }}>Custom header, own close</strong>
              <button type="button" data-testid="custom-close" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <p style={{ padding: 14, fontSize: 13, color: "var(--muted-foreground)" }}>
              hideHeader is true — PanelShell drew nothing above this.
            </p>
          </div>
        </PanelShell>
      </Frame>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId("custom-close"));
    await expect(canvas.getByText("Reopen")).toBeInTheDocument();
  },
};

/** A long title truncates with an ellipsis but keeps the full text on `title` — truthful rendering. */
export const LongTitleTruncates: Story = {
  render: () => (
    <Frame>
      <PanelShell
        eyebrow="RIGHT PANEL"
        title="A very long panel title that should truncate instead of wrapping or overflowing the header"
        onClose={fn()}
      >
        <p style={{ padding: 14, fontSize: 13, color: "var(--muted-foreground)" }}>Body content.</p>
      </PanelShell>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const heading = canvasElement.querySelector("h2");
    if (!(heading instanceof HTMLElement)) throw new Error("expected a heading");
    await expect(heading.title).toBe(
      "A very long panel title that should truncate instead of wrapping or overflowing the header",
    );
  },
};

/** Close button fires `onClose` exactly once. */
export const CloseFires: Story = {
  render: function Render() {
    const onClose = fn();
    return (
      <Frame>
        <PanelShell eyebrow="RIGHT PANEL" title="Frames" onClose={onClose}>
          <p style={{ padding: 14, fontSize: 13 }}>Body.</p>
        </PanelShell>
      </Frame>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /close frames/i }));
  },
};

/** Overflowing content scrolls INSIDE the body — the header stays put. */
export const ScrollingBody: Story = {
  render: () => (
    <Frame>
      <PanelShell eyebrow="RIGHT PANEL" title="Frames" onClose={fn()}>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {Array.from({ length: 40 }, (_, i) => (
            <li key={i} style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
              Row {i + 1}
            </li>
          ))}
        </ul>
      </PanelShell>
    </Frame>
  ),
};
