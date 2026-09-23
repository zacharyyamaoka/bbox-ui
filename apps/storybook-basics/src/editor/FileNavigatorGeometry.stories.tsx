import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { FileNavigator, type FileNavigatorProps } from "./fileNavigator";
import { createFakeWorkspaceClient, type FakeWorkspaceClient } from "../files/fakeWorkspaceClient";

/**
 * What the navigator's LAYOUT must hold, whatever is in the folder — the
 * bounded half of the 2026-09-22 fixes. Zach, with a screenshot: "please start
 * an agent to fix the built in fiel viewer it has many issues right now, first
 * of all its just way to long goes off the screen".
 *
 * WHY a third story file rather than cases added to the two beside it: both
 * are committed acceptance owned by the planning lane and off-limits. This one
 * only adds what those never drove — a folder with far more files than fit,
 * and a file name far longer than its column.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE. The defect Zach reported is only fully
 * visible under a HOST that scales its chrome with `zoom`, and Storybook is not
 * one — so the scale-dependent half (the frame staying inside the window at
 * 125%/160%) is proved against the real mounted app in
 * `apps/systemsketch/src/fileNavigatorGeometry.smoke.test.tsx`, which is where
 * `interface-scale.css` actually exists. What belongs HERE is everything that
 * is true at any scale and is the component's own to get right: the frame is
 * bounded by the window rather than by the file count, the table never
 * overflows its box sideways, the list scrolls through a stock ScrollArea, and
 * the frame publishes the `data-viewport-frame` contract a scaling host binds.
 */
const meta = {
  title: "Editor/Panels & Dialogs/FileNavigator/Geometry",
  tags: ["object:chrome", "lane:file-navigator-fixes"],
  component: FileNavigator,
  args: {
    open: false,
    onOpenChange: fn(),
    mode: "open" as const,
    client: createFakeWorkspaceClient({ root: "/home/bam", workspace: "/home/bam/SystemSketch" }),
    recents: [],
    onOpenDocument: fn(),
  },
} satisfies Meta<typeof FileNavigator>;

export default meta;
type Story = StoryObj<typeof meta>;

const P = "geo-nav";
const WS = "/home/bam/SystemSketch";
/** 2026-09-19 06:40 UTC — pinned so "Modified" reads the same on every run. */
const NOW = 1_789_800_000_000;

/** Longer than the Name column can ever be: the stress that made the Modified
 *  header read "Modifie" in Zach's screenshot. */
const LONG_NAME = "A very long board name that keeps going and going and going for quite a while.bbox";

/** 40 boards plus the long one — far more than fits any frame this dialog can
 *  have, so "the list scrolls" is a real claim rather than a vacuous one. */
function crowdedWorkspace(): FakeWorkspaceClient {
  const files: Record<string, { source: string; mtime: number }> = {};
  for (let index = 0; index < 40; index += 1) {
    files[`${WS}/Board ${String(index).padStart(2, "0")}.tldr`] = { source: "{}", mtime: NOW / 1000 - index * 3600 };
  }
  files[`${WS}/${LONG_NAME}`] = { source: "{}", mtime: NOW / 1000 };
  return createFakeWorkspaceClient({ root: "/home/bam", workspace: WS, files, directories: [`${WS}/Nested folder`] });
}

function Harness(props: Partial<FileNavigatorProps> & { client?: FakeWorkspaceClient }) {
  const client = useMemo(() => props.client ?? crowdedWorkspace(), [props.client]);
  const [open, setOpen] = useState(true);
  return (
    <FileNavigator
      open={open}
      onOpenChange={setOpen}
      mode="open"
      client={client}
      recents={[`${WS}/Board 00.tldr`, `${WS}/${LONG_NAME}`]}
      onOpenDocument={fn()}
      now={() => NOW}
      testIdPrefix={P}
      {...props}
    />
  );
}

const q = <T extends HTMLElement = HTMLElement>(id: string) => document.querySelector<T>(`[data-testid="${P}-${id}"]`)!;
/** The dialog popup itself — its testid is the bare prefix, with no suffix. */
const frameEl = () => document.querySelector<HTMLElement>(`[data-testid="${P}"]`)!;

/**
 * The frame's height once it has STOPPED moving.
 *
 * WHY every height here goes through this: the stock `DialogContent` opens
 * through `data-open:zoom-in-95`, a real transform and so a real change in the
 * measured rect. Read on the first settled tick it gave 677.44 against a true
 * 680 — a 2.5px "difference" that is the animation, not the layout, and it
 * drifted run to run (7.7px on another). Two consecutive frames agreeing is a
 * measurement, not a sleep. Same reasoning as `settledRect` in
 * `apps/systemsketch/src/interfaceScale.smoke.test.tsx`.
 */
async function settledHeight(): Promise<number> {
  let previous = frameEl().getBoundingClientRect().height;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    const now = frameEl().getBoundingClientRect().height;
    if (Math.abs(now - previous) < 0.05) return now;
    previous = now;
  }
  return previous;
}

/**
 * A crowded folder does not make the dialog taller: the frame is bounded by
 * the window, the list scrolls inside it, and the footer's actions stay put.
 */
export const ACrowdedFolderScrollsInsteadOfGrowing: Story = {
  render: () => <Harness />,
  play: async ({ canvasElement }) => {
    // `findBy*` first, on purpose: every negative assertion below would be
    // VACUOUSLY true against a DOM that has not mounted yet.
    const screen = within(canvasElement.ownerDocument.body);
    await screen.findByText("Open a document");
    await waitFor(() => expect(document.querySelectorAll(`[data-testid="${P}-row"]`).length).toBeGreaterThan(20));

    const height = await settledHeight();
    const box = frameEl().getBoundingClientRect();
    // Bounded by the WINDOW. 41 rows would be well over 1500px unbounded, so
    // a frame that fits the viewport cannot be sized by the file count.
    expect(height).toBeLessThanOrEqual(window.innerHeight);
    expect(box.bottom).toBeLessThanOrEqual(window.innerHeight + 1);
    expect(box.top).toBeGreaterThanOrEqual(-1);

    // …and the rows that do not fit are reachable by scrolling, not clipped.
    const viewport = q("list").querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
    expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight + 1);

    // The footer is inside the frame, below the list, at full width — the
    // primary action can never be the thing that gets pushed out.
    const confirm = q("confirm").getBoundingClientRect();
    expect(confirm.bottom).toBeLessThanOrEqual(box.bottom + 1);
    expect(confirm.top).toBeGreaterThanOrEqual(q("list").getBoundingClientRect().bottom - 1);
  },
};

/**
 * A name longer than its column is shortened with an ellipsis and keeps its
 * full value on hover — it never pushes the Size/Modified columns out of the
 * box, which is what made the header read "Modifie".
 */
export const ALongNameTruncatesInsteadOfPushingTheColumnsOut: Story = {
  render: () => <Harness />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await screen.findByText("Open a document");
    const row = await waitFor(() => {
      const found = document.querySelector<HTMLElement>(`[data-testid="${P}-row"][data-path="${CSS.escape(`${WS}/${LONG_NAME}`)}"]`);
      expect(found).toBeTruthy();
      return found!;
    });

    const container = frameEl().querySelector<HTMLElement>('[data-slot="table-container"]')!;
    expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth + 1);

    const modified = q("sort-modified");
    expect(modified.getBoundingClientRect().right).toBeLessThanOrEqual(frameEl().getBoundingClientRect().right + 1);
    // The whole word, not a prefix of it.
    expect(modified.textContent).toContain("Modified");
    expect(modified.scrollWidth).toBeLessThanOrEqual(modified.clientWidth + 1);

    // Truthful property rendering: shortened on screen, complete on hover.
    const name = row.querySelector<HTMLElement>("[data-name]")!;
    expect(name.getAttribute("title")).toBe(LONG_NAME);
    expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
  },
};

/**
 * Escape belongs to the Filter field only while there is a search to abandon.
 * The field is `autoFocus` in open mode, so an unconditional swallow — what
 * this shipped with — meant Escape never closed the dialog at all.
 */
export const EscapeClearsTheFilterThenClosesTheDialog: Story = {
  render: () => <Harness />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await screen.findByText("Open a document");
    await waitFor(() => expect(document.querySelectorAll(`[data-testid="${P}-row"]`).length).toBeGreaterThan(20));

    const filter = q<HTMLInputElement>("filter");
    await userEvent.type(filter, "Board 1");
    await waitFor(() => expect(filter.value).toBe("Board 1"));

    // With text: the search goes, the dialog stays.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(q<HTMLInputElement>("filter").value).toBe(""));
    expect(document.querySelector(`[data-testid="${P}"]`)).toBeTruthy();

    // Empty: the key belongs to the Dialog.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(document.querySelector(`[data-testid="${P}"]`)).toBeNull());
  },
};

/**
 * The frame publishes `data-viewport-frame` — the contract a host that scales
 * its chrome binds to hold this box in real pixels and scale its interior —
 * and the frame really is viewport-bound rather than content-bound.
 *
 * WHY "walk into an empty folder and re-measure" rather than re-deriving
 * `min(680px, 100vh - 4rem)` in JS: an assertion that recomputes the
 * stylesheet is a copy of the implementation and passes whatever the
 * implementation does. The property that actually matters to Zach is that the
 * dialog does not resize under him as he browses — 41 files and 0 files are
 * the same box — and this measures exactly that. (Storybook applies no
 * interface scale; `apps/systemsketch` proves the binding half.)
 */
export const TheFramePublishesItsViewportContract: Story = {
  render: () => <Harness />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await screen.findByText("Open a document");
    await waitFor(() => expect(document.querySelectorAll(`[data-testid="${P}-row"]`).length).toBeGreaterThan(20));

    expect(frameEl().hasAttribute("data-viewport-frame")).toBe(true);
    const crowded = await settledHeight();
    expect(crowded).toBeLessThanOrEqual(window.innerHeight);

    // Into the empty folder: a content-sized frame would collapse here.
    await userEvent.click(document.querySelector<HTMLElement>(`[data-testid="${P}-row"][data-kind="folder"]`)!);
    await waitFor(() => expect(screen.getByText("This folder has no boards yet.")).toBeTruthy());

    const empty = await settledHeight();
    expect(Math.abs(empty - crowded), `41 files and 0 files are the same box (crowded=${crowded}, empty=${empty})`).toBeLessThanOrEqual(1);
  },
};
