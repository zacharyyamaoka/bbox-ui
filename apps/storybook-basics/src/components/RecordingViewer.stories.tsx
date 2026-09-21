// src/components/RecordingViewer.stories.tsx — the player on its own.
//
// `RecordingControl.stories.tsx` proves the two are wired together; this file
// proves the player itself against the design it reproduces —
// /home/bam/systemsketch/scripts/recording_store.py:436-598
// (`PLAYBACK_TEMPLATE`), "slow frames, fast lanes, one scrubber".
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Button } from "./button";
import { RecordingViewer } from "./recordingViewer";
import { SAMPLE_RECORDING_BUNDLE } from "../recording/sampleRecording";

const node = (id: string) => document.querySelector<HTMLElement>(`[data-testid="recording-viewer-${id}"]`);
const viewer = () => document.querySelector<HTMLElement>('[data-testid="recording-viewer"]');
const rows = () => [...(viewer()?.querySelectorAll('[data-testid="recording-viewer-row"]') ?? [])];

function Harness({ bundle = SAMPLE_RECORDING_BUNDLE, startAtMs = 0 }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>View last recording</Button>
      <RecordingViewer open={open} onOpenChange={setOpen} bundle={bundle} startAtMs={startAtMs} />
    </>
  );
}

const meta = {
  title: "Basics/RecordingViewer",
  tags: ["area:basics", "lane:devtools"],
  component: RecordingViewer,
  parameters: { layout: "centered" },
  args: { open: false, onOpenChange: () => {}, bundle: SAMPLE_RECORDING_BUNDLE },
} satisfies Meta<typeof RecordingViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Frames, trace, scrubber, strip, detail pane and the packet, all present. */
export const Player: Story = {
  render: () => <Harness />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "View last recording" }));
    await waitFor(() => expect(viewer()).not.toBeNull());

    await expect(node("frame")).toHaveAttribute("data-frame-index", "0");
    await expect(node("clock")).toHaveTextContent("0 ms");
    await expect(node("packet")).toHaveTextContent("judgeConnection refused: row already bound");
    // The donor's own four-lane default (recording_store.py:509).
    const lanes = () => rows().map((row) => row.getAttribute("data-lane"));
    await expect(lanes()).toEqual(["mark"]);
  },
};

/** One scrubber, and everything on screen follows it. */
export const ScrubbingMovesFrameAndTrace: Story = {
  render: () => <Harness />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "View last recording" }));
    await waitFor(() => expect(viewer()).not.toBeNull());

    // Keyboard on the stock Slider: step is 10 ms, so five presses is 50 ms.
    // Base UI's `Slider.Thumb` is "a `<div>` element and a nested
    // `<input type="range">`" (SliderThumb.js:57) — the input is what holds
    // the value and the keyboard, so that is what a real key press reaches.
    const scrub = viewer()!.querySelector<HTMLInputElement>('[data-slot="slider"] input[type="range"]')!;
    await expect(scrub).toBeTruthy();
    scrub.focus();
    await userEvent.keyboard("{ArrowRight>5/}");
    await waitFor(() => expect(node("clock")).toHaveTextContent("50 ms"));

    // The strip is the fast way across: click the middle frame.
    await userEvent.click(node("thumb-1")!);
    await waitFor(() => expect(node("clock")).toHaveTextContent("3200 ms"));
    await expect(node("frame")).toHaveAttribute("data-frame-index", "1");
    const lanes = rows().map((row) => row.getAttribute("data-lane"));
    await expect(lanes).toContain("state");
    await expect(lanes).toContain("menu");
    await expect(lanes).not.toContain("console");

    // Backwards, which is the seek the donor had to rebuild its log for.
    await userEvent.click(node("thumb-0")!);
    await waitFor(() => expect(node("clock")).toHaveTextContent("0 ms"));
    await expect(rows()).toHaveLength(1);
  },
};

/** A row with a `detail` id opens the full record — the donor's `.detail` pane. */
export const ClickingARowShowsItsDetail: Story = {
  render: () => <Harness startAtMs={8_400} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "View last recording" }));
    await waitFor(() => expect(viewer()).not.toBeNull());
    await expect(node("clock")).toHaveTextContent("8400 ms");

    const withDetail = rows().find((row) => row.getAttribute("data-detail") === "console-000004");
    await expect(withDetail).toBeTruthy();
    await userEvent.click(withDetail!);
    await waitFor(() => expect(node("detail")).toHaveTextContent("judgeConnection refused"));
    await expect(node("detail")).toHaveTextContent('"kind": "console"');
  },
};

/** Nothing saved yet is an answer, not an error. */
export const NothingSavedYet: Story = {
  render: () => <Harness bundle={null as never} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "View last recording" }));
    await waitFor(() => expect(viewer()).not.toBeNull());
    await expect(node("empty")).toHaveTextContent("No recording has been saved yet.");
  },
};
