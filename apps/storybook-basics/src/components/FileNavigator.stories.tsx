import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { FileNavigator, type FileNavigatorProps } from "./fileNavigator";
import { screenshotWorkspace, type FakeWorkspaceClient } from "../files/fakeWorkspaceClient";
import { WorkspaceConflict } from "../files/workspaceClient";
import { DEFAULT_NEW_DOCUMENT_SUFFIX } from "../files/workspaceModel";

/**
 * The app's own file browser — "LOCAL WORKSPACE · Open a document" (Zach's
 * screenshot `Pasted image 20260919135724.png`), ported from the old app's
 * `WorkspaceDialog` onto stock shadcn parts, rendered against an in-memory
 * client (`files/fakeWorkspaceClient.ts`) that answers with the real host's
 * shapes. The real host is proved separately, against a real temp folder.
 *
 * ACCEPTANCE committed by the planning lane of
 * docs/CHROME-FILES-SETTINGS-PLAN.md before any builder; off-limits to lane
 * `files-kit`. Zach: "Please copy over the code from system sketch for the
 * file navigator here. its working good enough for now".
 */
const meta = {
  title: "Basics/FileNavigator",
  tags: ["area:basics", "lane:chrome-files-settings"],
  component: FileNavigator,
  // Each story renders `Harness`; these args exist only so
  // `StoryObj<typeof meta>` does not demand a full prop set per story.
  args: {
    open: false,
    onOpenChange: fn(),
    mode: "open" as const,
    client: screenshotWorkspace(),
    recents: [],
    onOpenDocument: fn(),
  },
} satisfies Meta<typeof FileNavigator>;

export default meta;
type Story = StoryObj<typeof meta>;

const P = "nav";
const WS = "/home/bam/SystemSketch";
/** 2026-09-19 06:40 UTC — pinned so "Modified" reads the same on every run. */
const NOW = 1_789_800_000_000;
const RECENTS = [`${WS}/bbox-ui-v3.systemsketch`, `${WS}/02_literal_argument.tldr`];

function Harness(props: Partial<FileNavigatorProps> & { client?: FakeWorkspaceClient }) {
  const client = useMemo(() => props.client ?? screenshotWorkspace(), [props.client]);
  const [open, setOpen] = useState(true);
  return (
    <FileNavigator
      open={open}
      onOpenChange={setOpen}
      mode="open"
      client={client}
      recents={RECENTS}
      onOpenDocument={fn()}
      now={() => NOW}
      testIdPrefix={P}
      {...props}
    />
  );
}

const q = <T extends HTMLElement = HTMLElement>(id: string) => document.querySelector<T>(`[data-testid="${P}-${id}"]`);
const all = (id: string) => Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${P}-${id}"]`));
const rowNames = () => all("row").map((row) => row.getAttribute("data-path")!.split("/").pop()!);
const row = (name: string) => all("row").find((candidate) => candidate.getAttribute("data-path")!.endsWith(`/${name}`))!;

async function ready(mode: "open" | "saveAs") {
  const dialog = await within(document.body).findByTestId(P);
  await expect(dialog).toHaveAttribute("data-mode", mode);
  await waitFor(() => expect(all("row").length).toBeGreaterThan(0));
  return dialog;
}

/** Places, Recent, the breadcrumb and the table — folders first, documents by name. */
export const OpenAFile: Story = {
  render: () => <Harness />,
  play: async () => {
    const dialog = await ready("open");
    await expect(dialog).toHaveTextContent(/Local workspace/i);
    await expect(dialog).toHaveTextContent("Open a document");

    await expect(all("place").map((place) => place.textContent)).toEqual([
      expect.stringContaining("SystemSketch"),
      expect.stringContaining("Home"),
    ]);
    await expect(all("place")[0]).toHaveTextContent(WS);
    await expect(all("place")[1]).toHaveTextContent("/home/bam");
    await expect(all("recent").map((recent) => recent.textContent)).toEqual([
      expect.stringContaining("bbox-ui-v3"),
      expect.stringContaining("02_literal_argument"),
    ]);
    await expect(q("crumbs")).toHaveTextContent(/bam.*SystemSketch/);

    await expect(rowNames()).toEqual([
      "recordings",
      "02_literal_argument.tldr",
      "AI Workflow.systemsketch",
      "bbox-ui-anatomy-example.tldr",
      "bbox-ui-v3.systemsketch",
      "series_a_pose_pipeline_v7.systemsketch",
    ]);
    await expect(row("recordings")).toHaveAttribute("data-kind", "folder");
    await expect(row("02_literal_argument.tldr")).toHaveAttribute("data-kind", "document");
    await expect(row("02_literal_argument.tldr")).toHaveTextContent(/Sep\s+3/);
    await expect(row("bbox-ui-v3.systemsketch")).toHaveTextContent("Yesterday");
    await expect(q("confirm")).toHaveTextContent("Open");
    await expect(q("open-in-new-window")).toHaveTextContent("Open in new window");
  },
};

/** Modified sorts newest-first on its first click; a second click reverses; folders stay on top. */
export const SortAndFilter: Story = {
  render: () => <Harness />,
  play: async () => {
    await ready("open");
    await userEvent.click(q("sort-modified")!);
    await waitFor(() => expect(q("sort-modified")).toHaveAttribute("aria-sort", "descending"));
    await expect(rowNames()).toEqual([
      "recordings",
      "series_a_pose_pipeline_v7.systemsketch",
      "bbox-ui-v3.systemsketch",
      "bbox-ui-anatomy-example.tldr",
      "AI Workflow.systemsketch",
      "02_literal_argument.tldr",
    ]);
    await userEvent.click(q("sort-modified")!);
    await waitFor(() => expect(q("sort-modified")).toHaveAttribute("aria-sort", "ascending"));
    await expect(rowNames()[1]).toBe("02_literal_argument.tldr");

    await userEvent.type(q<HTMLInputElement>("filter")!, "anatomy");
    await waitFor(() => expect(rowNames()).toEqual(["bbox-ui-anatomy-example.tldr"]));
    await userEvent.clear(q<HTMLInputElement>("filter")!);
    await userEvent.type(q<HTMLInputElement>("filter")!, "zzz");
    await waitFor(() => expect(within(document.body).getByText(/Nothing here matches/)).toBeInTheDocument());
  },
};

function SpyHarness({ log }: { log: [string, { newWindow: boolean }][] }) {
  return <Harness onOpenDocument={(path, options) => void log.push([path, options])} />;
}

const LOG: [string, { newWindow: boolean }][] = [];

export const OpenGestures: Story = {
  render: () => <SpyHarness log={LOG} />,
  play: async () => {
    LOG.length = 0;
    await ready("open");
    await userEvent.dblClick(row("02_literal_argument.tldr"));
    await waitFor(() => expect(LOG).toContainEqual([`${WS}/02_literal_argument.tldr`, { newWindow: false }]));

    await userEvent.click(row("bbox-ui-anatomy-example.tldr"));
    await expect(row("bbox-ui-anatomy-example.tldr")).toHaveAttribute("aria-selected", "true");
    await userEvent.click(q("open-in-new-window")!);
    await waitFor(() => expect(LOG).toContainEqual([`${WS}/bbox-ui-anatomy-example.tldr`, { newWindow: true }]));

    await userEvent.click(all("recent")[0]);
    await waitFor(() => expect(LOG).toContainEqual([`${WS}/bbox-ui-v3.systemsketch`, { newWindow: false }]));
  },
};

/** Double-click opens, "Open in new window" says so, a Recent opens directly. */
/** Folders: into one, the empty copy, back up with ←, and "+ Folder". */
export const FoldersAndNewFolder: Story = {
  render: () => <Harness />,
  play: async () => {
    await ready("open");
    await userEvent.click(row("recordings"));
    await waitFor(() => expect(q("crumbs")).toHaveTextContent(/SystemSketch.*recordings/));
    await expect(within(document.body).getByText("This folder has no boards yet.")).toBeInTheDocument();
    await userEvent.click(q("parent")!);
    await waitFor(() => expect(rowNames()).toContain("02_literal_argument.tldr"));

    await userEvent.click(q("new-folder")!);
    const name = await waitFor(() => {
      const input = q<HTMLInputElement>("new-folder-name");
      expect(input).toBeTruthy();
      return input!;
    });
    await userEvent.type(name, "Robotics{Enter}");
    await waitFor(() => expect(q("crumbs")).toHaveTextContent(/SystemSketch.*Robotics/));
  },
};

/** ↑/↓ move the selection and clamp; Enter activates it. */
export const Keyboard: Story = {
  render: () => <SpyHarness log={LOG} />,
  play: async () => {
    LOG.length = 0;
    await ready("open");
    // A fresh list selects its first DOCUMENT, so Enter means something at once.
    await waitFor(() => expect(row("02_literal_argument.tldr")).toHaveAttribute("aria-selected", "true"));
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(row("AI Workflow.systemsketch")).toHaveAttribute("aria-selected", "true"));
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(LOG).toContainEqual([`${WS}/AI Workflow.systemsketch`, { newWindow: false }]));
  },
};

const SAVES: [string, { force: boolean }][] = [];

/** Save As: the name field, the suffix beside it, the path the host is handed. */
export const SaveACopy: Story = {
  render: () => (
    <Harness
      mode="saveAs"
      defaultName="Untitled board"
      onSaveAs={async (path, options) => {
        SAVES.push([path, options]);
      }}
    />
  ),
  play: async () => {
    SAVES.length = 0;
    const dialog = await ready("saveAs");
    await expect(dialog).toHaveTextContent("Save a copy");
    const name = q<HTMLInputElement>("name")!;
    await expect(name).toHaveValue("Untitled board");
    // What a NEW document gets. Zach, 2026-09-21: "lets call this file type
    // .bbox as this project is no longer system sketch its just the bbox
    // whiteboard". Read from the component's own constant, so the label and
    // the path it writes cannot drift apart.
    await expect(q("suffix")).toHaveTextContent(DEFAULT_NEW_DOCUMENT_SUFFIX);
    await expect(q("confirm")).toHaveTextContent("Save");
    await userEvent.clear(name);
    await userEvent.type(name, "roundtrip");
    await userEvent.click(q("confirm")!);
    await waitFor(() => expect(SAVES).toEqual([[`${WS}/roundtrip${DEFAULT_NEW_DOCUMENT_SUFFIX}`, { force: false }]]));
  },
};

/**
 * The half of the `.bbox` rename that is easy to get wrong: picking a row
 * fills the name field with its TITLE, so a naive default would have proposed
 * `02_literal_argument.bbox` — a NEW file beside the `.tldr` the person was
 * pointing at, no conflict, no Replace prompt, the original left untouched.
 * Zach has 31 `.tldr` and 84 `.systemsketch` boards; "we write .bbox now" is
 * not allowed to mean "we fork the one you clicked".
 */
export const PickingAnExistingRowKeepsThatFilesExtension: Story = {
  render: () => (
    <Harness
      mode="saveAs"
      defaultName="Untitled board"
      onSaveAs={async (path, options) => {
        SAVES.push([path, options]);
      }}
    />
  ),
  play: async () => {
    SAVES.length = 0;
    await ready("saveAs");
    await expect(q("suffix")).toHaveTextContent(DEFAULT_NEW_DOCUMENT_SUFFIX);

    await userEvent.click(row("02_literal_argument.tldr"));
    await waitFor(() => expect(q<HTMLInputElement>("name")).toHaveValue("02_literal_argument"));
    // The label follows the pick, so the extension is never a surprise.
    await waitFor(() => expect(q("suffix")).toHaveTextContent(".tldr"));
    await userEvent.click(q("confirm")!);
    await waitFor(() => expect(SAVES).toEqual([[`${WS}/02_literal_argument.tldr`, { force: false }]]));

    // A typed suffix still beats everything, and the label says so rather than
    // continuing to advertise the picked one.
    SAVES.length = 0;
    const name = q<HTMLInputElement>("name")!;
    await userEvent.clear(name);
    await userEvent.type(name, "elsewhere.systemsketch");
    await waitFor(() => expect(q("suffix")).toHaveTextContent(".systemsketch"));
    await userEvent.click(q("confirm")!);
    await waitFor(() => expect(SAVES).toEqual([[`${WS}/elsewhere.systemsketch`, { force: false }]]));
  },
};

/** A name that exists: the host's conflict turns the primary into Replace, which forces the SAME path. */
export const SaveOverAnExistingFileAsksFirst: Story = {
  render: () => (
    <Harness
      mode="saveAs"
      defaultName="Untitled board"
      onSaveAs={async (path, options) => {
        SAVES.push([path, options]);
        if (!options.force) throw new WorkspaceConflict("02_literal_argument.tldr already exists", 1, "disk");
      }}
    />
  ),
  play: async () => {
    SAVES.length = 0;
    await ready("saveAs");
    await userEvent.click(row("02_literal_argument.tldr"));
    await waitFor(() => expect(q<HTMLInputElement>("name")).toHaveValue("02_literal_argument"));
    await userEvent.click(q("confirm")!);
    const replace = await waitFor(() => {
      const button = q("replace");
      expect(button).toBeTruthy();
      return button!;
    });
    await expect(replace).toHaveTextContent("Replace");
    await expect(within(document.body).getByRole("alert")).toHaveTextContent("“02_literal_argument” already exists. Replace it with this document?");
    await userEvent.click(replace);
    await waitFor(() =>
      expect(SAVES).toEqual([
        [`${WS}/02_literal_argument.tldr`, { force: false }],
        [`${WS}/02_literal_argument.tldr`, { force: true }],
      ]),
    );
  },
};
