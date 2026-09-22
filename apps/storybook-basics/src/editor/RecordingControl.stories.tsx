// src/editor/RecordingControl.stories.tsx — the recorder, driven.
//
// The control is a pure surface (src/editor/recordingControl.tsx) and the
// machine is a pure core (src/recording/recordingCore.ts), so the ONE thing
// neither of them can prove alone is that they are wired together correctly:
// that the chevron really opens the panel, that both rows really reach their
// callbacks, that Stop really produces "Packet copied", and that "View last
// recording" really opens the player over frames and a trace.
//
// The harness below is exactly as thin as the real host will be — a core over
// `createFakeRecordingEffects`, `useRecordingState`, `useRecordingElapsed`,
// four callbacks. If the real wiring in `apps/systemsketch` needs more than
// this, the seam is wrong.
import { useEffect, useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { RecordingControl } from "./recordingControl";
import { RecordingViewer } from "./recordingViewer";
import {
  createFakeRecordingEffects,
  type FakeRecordingEffects,
} from "../recording/fakeRecordingEffects";
import {
  createRecordingCore,
  EXPLICIT_RECORDING_LIMIT_MS,
  INITIAL_RECORDING_STATE,
} from "../recording/recordingCore";
import type { RecordingBundle } from "../recording/recordingClient";
import { SAMPLE_RECORDING_BUNDLE } from "../recording/sampleRecording";
import { useRecordingElapsed, useRecordingState } from "../recording/useRecording";

const P = "recording";
const node = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const panelRow = (id: string) => node(`${P}-${id}`);

/** The live fake, so a play function can advance the clock or read the log. */
let live: FakeRecordingEffects | null = null;

interface HarnessProps {
  /** A recording already on disk, so "Copy/View last recording" are enabled. */
  withLast?: boolean;
  header?: "full" | "status-only" | "none";
}

function Harness({ withLast = false, header = "full" }: HarnessProps) {
  const effects = useMemo(
    () =>
      createFakeRecordingEffects({
        last: withLast
          ? {
              path: SAMPLE_RECORDING_BUNDLE.path,
              packet: SAMPLE_RECORDING_BUNDLE.packet,
              savedAt: "2026-09-19T18:24:53.400Z",
              frames: 3,
              framesSource: "canvas",
            }
          : null,
      }),
    [withLast],
  );
  const core = useMemo(() => createRecordingCore(effects), [effects]);
  const state = useRecordingState(core);
  const elapsed = useRecordingElapsed(state.takeStartedAt);
  const [bundle, setBundle] = useState<RecordingBundle | null>(null);
  const [viewing, setViewing] = useState(false);

  useEffect(() => {
    live = effects;
    core.setChannel({ channel: "preview", build: "dev", version: "0.1.0" });
    return core.install();
  }, [core, effects]);

  return (
    <div className="w-[26rem] p-4">
      <RecordingControl
        state={state}
        elapsedMs={elapsed}
        header={header}
        onStart={() => void core.start()}
        onStop={() => void core.stop("")}
        onCopyLast={() => void core.copyLast()}
        // The host's whole job for "view last recording": read the bundle back
        // and open the modal. In the real app this is `client.readBundle()`.
        onViewLast={() => {
          setBundle(SAMPLE_RECORDING_BUNDLE);
          setViewing(true);
        }}
      />
      <RecordingViewer open={viewing} onOpenChange={setViewing} bundle={bundle} />
    </div>
  );
}

const meta = {
  title: "Editor/Panels & Dialogs/RecordingControl",
  tags: ["object:chrome", "lane:devtools"],
  component: RecordingControl,
  parameters: { layout: "centered" },
  // Every story below renders through `Harness`, which owns a real core; these
  // args exist so the docs page has a shape to show and so `satisfies Meta`
  // can see the required props.
  args: {
    state: INITIAL_RECORDING_STATE,
    onStart: () => {},
    onStop: () => {},
    onCopyLast: () => {},
    onViewLast: () => {},
  },
} satisfies Meta<typeof RecordingControl>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The surface in Zach's screenshot (~/zach_brain/Pasted image
 * 20260919182230.png): a RECORDING label, a right-hand scope caption, and a
 * full-width blue "● Start recording" with a chevron segment.
 */
export const Ready: Story = {
  render: () => <Harness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: /Start recording/ })).toBeVisible();
    await expect(panelRow("status")).toHaveTextContent("Ready · 1 min maximum");
    // Nothing is armed and nothing is listening until Start is pressed.
    await expect(live!.armed).toEqual([false]);
    await expect(live!.collectorLog.started).toBe(0);
  },
};

/**
 * The chevron's panel (~/zach_brain/Pasted image 20260919182508.png), now
 * carrying BOTH rows — Zach, 2026-09-19: "As part of the drop down. please
 * give the option to 'view last recording'".
 */
export const PanelShowsBothRows: Story = {
  render: () => <Harness withLast />,
  play: async () => {
    await waitFor(() => expect(panelRow("last-path")).toBeNull());
    await userEvent.click(panelRow("more")!);

    const panel = await waitFor(() => {
      const found = panelRow("panel");
      expect(found).not.toBeNull();
      return found!;
    });

    // Row 1: the copy action, with the folder beneath it, home-shortened.
    await expect(panelRow("copy-last")).toHaveTextContent("Copy last recording");
    await expect(panelRow("last-path")).toHaveTextContent("~/SystemSketch/recordings/2026-09-19_18-24-45-take");
    // Row 2: the new one.
    await expect(panelRow("view-last")).toHaveTextContent("View last recording");
    // The policy line is the contract: only Stop writes a folder.
    await expect(panelRow("policy")).toHaveTextContent(
      "Stop saves and copies · the 1 min limit cancels without saving",
    );
    // WHY waitFor and not a bare assertion: the stock Popover opens through
    // `data-open:animate-in … fade-in-0`, so under a full-suite run the popup
    // is in the DOM and readable while still mid-fade. Measured: green alone,
    // red once 121 story files shared the browser.
    await waitFor(() => expect(panel).toBeVisible());

    // And the copy row really copies — through the core, not the control.
    await userEvent.click(panelRow("copy-last")!);
    await waitFor(() => expect(live!.clipboard).toHaveLength(1));
    await expect(panelRow("clipboard")).toHaveTextContent("Packet copied");
  },
};

/**
 * "View last recording" opens the player in a modal — the design Zach
 * remembered (`playback_html()`, recording_store.py:605) — and it really
 * scrubs.
 */
export const ViewLastOpensThePlayer: Story = {
  render: () => <Harness withLast />,
  play: async () => {
    await userEvent.click(panelRow("more")!);
    await waitFor(() => expect(panelRow("panel")).not.toBeNull());
    await userEvent.click(panelRow("view-last")!);

    const viewer = await waitFor(() => {
      const found = node("recording-viewer");
      expect(found).not.toBeNull();
      return found!;
    });
    await expect(node("recording-viewer-meta")).toHaveTextContent("8.40 s · 14 rows · 3 frames (canvas)");

    // It shows the screenshots…
    await expect(node("recording-viewer-frame")).toHaveAttribute("data-frame-index", "0");
    await expect(viewer.querySelectorAll('[data-testid="recording-viewer-strip"] img')).toHaveLength(3);

    // …and the event trace, with the four high-volume lanes hidden by
    // default exactly as the donor's viewer had them (py:509).
    const lanes = () =>
      [...viewer.querySelectorAll('[data-testid="recording-viewer-row"]')].map((row) =>
        row.getAttribute("data-lane"),
      );
    await expect(lanes()).toContain("mark");
    await expect(lanes()).not.toContain("input");
    await expect(lanes()).not.toContain("dom");

    // Scrub by clicking a frame in the strip: the clock, the frame and the
    // trace all move together.
    await userEvent.click(node("recording-viewer-thumb-1")!);
    await waitFor(() => expect(node("recording-viewer-clock")).toHaveTextContent("3200 ms"));
    await expect(node("recording-viewer-frame")).toHaveAttribute("data-frame-index", "1");
    await expect(lanes()).toContain("action");
    await expect(lanes()).not.toContain("console");

    // Scrub with the keyboard on the scrubber itself, then to the end.
    await userEvent.click(node("recording-viewer-thumb-2")!);
    await waitFor(() => expect(node("recording-viewer-frame")).toHaveAttribute("data-frame-index", "2"));
    await expect(lanes()).toContain("console");

    // Turn a hidden lane on, and its rows appear.
    await userEvent.click(node("recording-viewer-lane-dom")!);
    await waitFor(() => expect(lanes()).toContain("dom"));

    // Close it.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(node("recording-viewer")).toBeNull());
  },
};

/** Start → Stop is the whole primary path: it saves AND copies, unasked. */
export const StopSavesAndCopies: Story = {
  render: () => <Harness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Start recording/ }));

    await waitFor(() => expect(node(P)).toHaveAttribute("data-mode", "take"));
    await expect(panelRow("status")).toHaveTextContent("REC ·");
    await expect(live!.armed).toEqual([false, true]);

    await userEvent.click(panelRow("stop")!);
    await waitFor(() => expect(live!.saved).toHaveLength(1));
    await waitFor(() => expect(panelRow("status")).toHaveTextContent("Saved · packet copied"));

    // The packet went to the clipboard on its own — nobody pressed copy.
    await expect(live!.clipboard).toHaveLength(1);
    await expect(live!.clipboard[0]).toBe(live!.saved[0] && live!.last!.packet);
    // …and both fallback frames rode along with the buffer.
    await expect(live!.saved[0].extras.canvasFrames.map((frame) => frame.t)).toEqual([0, 8400]);
  },
};

/**
 * The safety rule, seen from the control: a forgotten take is DISCARDED at
 * the one-minute limit, and the surface says so rather than quietly implying
 * a folder exists.
 */
export const TheLimitCancelsWithoutSaving: Story = {
  render: () => <Harness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Start recording/ }));
    await waitFor(() => expect(node(P)).toHaveAttribute("data-mode", "take"));

    // No real waiting: the core's clock is injected (fakeRecordingEffects.ts).
    live!.clock.advance(EXPLICIT_RECORDING_LIMIT_MS);

    await waitFor(() => expect(node(P)).toHaveAttribute("data-mode", "idle"));
    await expect(panelRow("status")).toHaveTextContent("Cancelled · nothing saved");
    await expect(live!.saved).toEqual([]);
    await expect(live!.clipboard).toEqual([]);
    await expect(canvas.getByRole("button", { name: /Start recording/ })).toBeVisible();
  },
};

/**
 * THE SLOT CONTRACT. In the Dev panel this control is the `content` of a
 * `{ kind: "slot" }` row and the section header already paints the label and
 * the scope caption, so the control draws neither.
 */
export const InAPanelSlot: Story = {
  render: () => <Harness withLast header="none" />,
  play: async ({ canvasElement }) => {
    await expect(panelRow("status")).toBeNull();
    await expect(within(canvasElement).getByRole("button", { name: /Start recording/ })).toBeVisible();
    await expect(panelRow("more")).not.toBeNull();
  },
};
