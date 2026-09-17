import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { LabeledPort } from "../components/labeledPort";
import { PORT_RING_OVERHANG_PX, PORT_LABEL_GAP, type BlockSide } from "../components/port.layout";

const meta = {
  title: "Basics/LabeledPort",
  component: LabeledPort,
  args: { children: "value", state: "empty", edge: "left" },
} satisfies Meta<typeof LabeledPort>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A single labeled port at rest — the dot plus its inward-flowing label. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const port = canvasElement.querySelector('[data-slot="port"]');
    if (!(port instanceof HTMLElement)) throw new Error('expected a [data-slot="port"]');
    await expect(port.querySelector('[data-slot="port-dot"]')).not.toBeNull();
    await expect(port.querySelector('[data-slot="port-label"]')).not.toBeNull();
    await expect(within(port).getByText("value")).toBeInTheDocument();
  },
};

const EDGES: BlockSide[] = ["left", "right", "top", "bottom"];

/**
 * The four wall edges, each with its own auto-inward label direction: a
 * left-wall port's label flows right (into the block); a top-wall port's
 * flows down; etc.
 */
export const FourEdges: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 40 }}>
      {EDGES.map((edge) => (
        <div key={edge} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 120, height: 60 }}>
            <LabeledPort edge={edge} state="wired">
              {edge}
            </LabeledPort>
          </div>
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>edge={edge}</span>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const ports = Array.from(canvasElement.querySelectorAll('[data-slot="port"]'));
    await expect(ports).toHaveLength(4);
    const layouts = ports.map((p) => p.getAttribute("data-text-layout"));
    // left -> right, right -> left, top -> bot, bottom -> top (inwardTextLayout).
    await expect(layouts).toEqual(["right", "left", "bot", "top"]);
  },
};

/**
 * The key story: a wire drawn straight through the dot's own centre line
 * (an absolutely-positioned div standing in for the trace). `right` shows
 * the label sitting ON the wire — text and line overlap; `rightOffset`
 * shows the SAME label lifted clear, its bottom edge above the line, at any
 * label height (that's the point of `align: "end"` — see port.layout.ts).
 * Measured with `getBoundingClientRect`, not asserted from a class name.
 */
function WireComparison({ layout, caption }: { layout: "right" | "rightOffset"; caption: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{caption}</span>
      <div data-testid={`wire-wrap-${layout}`} style={{ position: "relative", width: 220, height: 60, display: "flex", alignItems: "center" }}>
        {/* The trace wire: a literal horizontal line through the dot's centre. */}
        <div
          data-testid={`wire-${layout}`}
          style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 2, background: "var(--bbox-primary)", opacity: 0.6 }}
        />
        <LabeledPort textLayout={layout} state="wired" diameter="md">
          pose: Pose = None
        </LabeledPort>
      </div>
    </div>
  );
}

export const OffsetClearsTheWire: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 48 }}>
      <WireComparison layout="right" caption="right — label sits ON the wire" />
      <WireComparison layout="rightOffset" caption="rightOffset — label clears the wire" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const rightWire = canvasElement.querySelector('[data-testid="wire-right"]');
    const rightLabel = canvasElement.querySelector('[data-testid="wire-wrap-right"] [data-slot="port-label"]');
    const offsetWire = canvasElement.querySelector('[data-testid="wire-rightOffset"]');
    const offsetLabel = canvasElement.querySelector('[data-testid="wire-wrap-rightOffset"] [data-slot="port-label"]');
    if (!(rightWire instanceof HTMLElement) || !(rightLabel instanceof HTMLElement)) throw new Error("expected right wire + label");
    if (!(offsetWire instanceof HTMLElement) || !(offsetLabel instanceof HTMLElement)) throw new Error("expected rightOffset wire + label");

    const wireY = rightWire.getBoundingClientRect().top; // same for both (identical geometry)
    const rightLabelBox = rightLabel.getBoundingClientRect();
    const offsetLabelBox = offsetLabel.getBoundingClientRect();

    // "right": the wire's y sits INSIDE the label's vertical span — impaled.
    await expect(rightLabelBox.top).toBeLessThanOrEqual(wireY);
    await expect(rightLabelBox.bottom).toBeGreaterThanOrEqual(wireY);

    // "rightOffset": the label's bottom edge clears the wire — sits strictly
    // above it, not merely coincident.
    await expect(offsetLabelBox.bottom).toBeLessThan(wireY);

    // The gap measured from the dot's PAINTED ring: PORT_RING_OVERHANG_PX (5)
    // + PORT_LABEL_GAP (8) = 13px, and it's the SAME 13px on both layouts —
    // only the vertical anchor differs, not the along-axis distance.
    const dotRight = canvasElement.querySelector('[data-testid="wire-wrap-right"] [data-slot="port-dot"]');
    const offsetDotRight = canvasElement.querySelector('[data-testid="wire-wrap-rightOffset"] [data-slot="port-dot"]');
    if (!(dotRight instanceof HTMLElement) || !(offsetDotRight instanceof HTMLElement)) throw new Error("expected both dots");
    const gapRight = Math.round(rightLabelBox.left - dotRight.getBoundingClientRect().right);
    const gapOffset = Math.round(offsetLabelBox.left - offsetDotRight.getBoundingClientRect().right);
    await expect(gapRight).toBe(PORT_RING_OVERHANG_PX + PORT_LABEL_GAP);
    await expect(gapOffset).toBe(PORT_RING_OVERHANG_PX + PORT_LABEL_GAP);
  },
};

/**
 * The secondary slot: any `ReactNode`, hugging one of the dot's four
 * corners, auto-defaulting to the corner OPPOSITE wherever the label is
 * flowing. `secondarySlot={<></>}` (an explicitly emptied slot) renders no
 * badge at all — present-beats-absent, not a `??` that would resurrect a
 * default.
 */
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 8, background: "var(--muted)", color: "var(--muted-foreground)" }}>
      {children}
    </span>
  );
}

export const SecondarySlot: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{ width: 140, height: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LabeledPort state="wired" secondarySlot={<Pill>2</Pill>}>
            args
          </LabeledPort>
        </div>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>badge, auto corner (opposite label)</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{ width: 140, height: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LabeledPort state="received" secondarySlot={<Pill>Event 4</Pill>}>
            out
          </LabeledPort>
        </div>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>"Event 4" pill</span>
      </div>
      {(["leftOffset", "rightOffset", "topOffset", "botOffset"] as const).map((corner) => (
        <div key={corner} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ width: 140, height: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LabeledPort state="empty" secondarySlot={<Pill>*</Pill>} secondarySlotLayout={corner}>
              cfg
            </LabeledPort>
          </div>
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{corner}</span>
        </div>
      ))}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div data-testid="emptied-slot" style={{ width: 140, height: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LabeledPort state="empty" secondarySlot={<></>}>
            emptied
          </LabeledPort>
        </div>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>secondarySlot={"{<></>}"} — no badge, ever</span>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const badges = canvasElement.querySelectorAll('[data-slot="port-secondary-slot"]');
    // 2 (args/out) + 4 (corners) + 1 (emptied, still mounts the wrapper) = 7
    await expect(badges).toHaveLength(7);
    const emptied = canvasElement.querySelector('[data-testid="emptied-slot"] [data-slot="port-secondary-slot"]');
    if (!(emptied instanceof HTMLElement)) throw new Error("expected the emptied slot's wrapper");
    await expect(emptied.textContent).toBe("");
  },
};

/**
 * The real click-to-edit loop on the built-in label field: click → an
 * in-place control mounts → type → commit → `onLabelWrite` carries the new
 * value back to the host.
 */
function ControlledLabeledPort({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <LabeledPort state="empty" onLabelWrite={setValue}>
      {value}
    </LabeledPort>
  );
}

export const EditableLabel: Story = {
  render: () => <ControlledLabeledPort initial="pose" />,
  play: async ({ canvasElement }) => {
    const label = canvasElement.querySelector('[data-slot="port-label"]');
    if (!(label instanceof HTMLElement)) throw new Error('expected a [data-slot="port-label"]');
    const resting = label.querySelector('[data-slot="editable-text"]');
    if (!(resting instanceof HTMLElement)) throw new Error("expected the resting editable-text box");

    await userEvent.click(resting);
    const input = await waitFor(() => {
      const el = canvasElement.querySelector('[data-slot="editable-text-input"]');
      if (!(el instanceof HTMLInputElement)) throw new Error("expected the editing <input> to mount");
      return el;
    });

    await userEvent.clear(input);
    await userEvent.type(input, "pose: Pose = None", { delay: 0 });
    await userEvent.keyboard("{Enter}");

    await waitFor(() => {
      const el = canvasElement.querySelector('[data-slot="editable-text"]');
      if (!(el instanceof HTMLElement) || el.getAttribute("data-editing") !== "false") {
        throw new Error("expected the label to return to resting state after commit");
      }
    });
    const canvas = within(canvasElement);
    await expect(canvas.getByText("pose: Pose = None")).toBeInTheDocument();
  },
};
