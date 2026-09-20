import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { FileNavigator, type FileNavigatorProps } from "../components/fileNavigator";
import { screenshotWorkspace, type FakeWorkspaceClient } from "../files/fakeWorkspaceClient";

/**
 * ACCEPTANCE for the judge's P2-8, navigator half: the Places/Recent rail and
 * the path row are STOCK parts (`Button`, `Breadcrumb*`), and every behaviour
 * the plan's §3 lists as "must survive" still survives them.
 *
 * WHY a second story file rather than more cases in `FileNavigator.stories.tsx`:
 * that file is the planning lane's committed acceptance and is off-limits to a
 * builder — a lane that could edit it could make it agree with whatever it
 * built. This file only ADDS the two behaviours that file never drove
 * (clicking a breadcrumb segment, and the rail's tab order), which are exactly
 * the two a hand-to-stock rebuild is most likely to drop.
 */
const meta = {
  title: "Basics/FileNavigator Stock Parts",
  tags: ["area:basics", "lane:chrome-files-settings"],
  component: FileNavigator,
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

const P = "stock-nav";
const WS = "/home/bam/SystemSketch";
const NOW = 1_789_800_000_000;
const RECENTS = [`${WS}/bbox-ui-v3.systemsketch`, `${WS}/02_literal_argument.tldr`];

const q = <T extends HTMLElement = HTMLElement>(id: string) => document.querySelector<T>(`[data-testid="${P}-${id}"]`);
const all = (id: string) => Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${P}-${id}"]`));
const rowNames = () =>
  Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${P}-row"]`)).map((row) => row.getAttribute("data-path")!.split("/").pop()!);

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

async function ready() {
  const dialog = await within(document.body).findByTestId(P);
  await waitFor(() => expect(rowNames().length).toBeGreaterThan(0));
  return dialog;
}

/**
 * The path row is a real `Breadcrumb`: ancestors are links, the folder you are
 * in is the page — and clicking an ancestor still navigates, which is the
 * donor behaviour (`LocalWorkspace.tsx:2053-2130`) the rebuild had to keep.
 */
export const BreadcrumbNavigates: Story = {
  render: () => <Harness />,
  play: async () => {
    await ready();
    const crumbs = q("crumbs")!;
    await expect(crumbs.tagName).toBe("NAV");
    await expect(crumbs.querySelector('[data-slot="breadcrumb-list"]')).not.toBeNull();

    // Deepest segment = the current folder: a page, not a link, and it says so.
    const page = crumbs.querySelector<HTMLElement>('[data-slot="breadcrumb-page"]')!;
    await expect(page).toHaveTextContent("SystemSketch");
    await expect(page).toHaveAttribute("aria-current", "page");

    const links = Array.from(crumbs.querySelectorAll<HTMLElement>('[data-slot="breadcrumb-link"]'));
    await expect(links.map((link) => link.textContent)).toEqual(["bam"]);
    await expect(links[0]).toHaveAttribute("title", "/home/bam");

    await userEvent.click(links[0]);
    await waitFor(() => expect(rowNames()).toContain("SystemSketch"));
    await waitFor(() => expect(q("crumbs")!.querySelector('[data-slot="breadcrumb-page"]')).toHaveTextContent("bam"));
    // Now at the root: nothing left to climb to, so no link remains.
    await expect(q("crumbs")!.querySelectorAll('[data-slot="breadcrumb-link"]').length).toBe(0);
    await expect(q("parent")).toBeDisabled();
  },
};

/**
 * The rail is stock `Button`s in the donor's order — Places, then Recent —
 * and Tab walks them in that order. A rail rebuilt out of divs, or reordered,
 * fails here.
 */
export const RailIsStockButtonsInTabOrder: Story = {
  render: () => <Harness />,
  play: async () => {
    await ready();
    const places = all("place");
    const recents = all("recent");
    await expect(places.length).toBe(2);
    await expect(recents.length).toBe(2);
    for (const control of [...places, ...recents]) {
      await expect(control.tagName).toBe("BUTTON");
      await expect(control).toHaveAttribute("data-slot", "button");
    }
    // Truthful rendering: the full path stays discoverable on hover even
    // though the rail truncates it (feedback_truthful_property_rendering).
    await expect(places[0]).toHaveAttribute("title", WS);
    await expect(recents[0]).toHaveAttribute("title", `${WS}/bbox-ui-v3.systemsketch`);

    places[0].focus();
    await expect(document.activeElement).toBe(places[0]);
    await userEvent.tab();
    await expect(document.activeElement).toBe(places[1]);
    await userEvent.tab();
    await expect(document.activeElement).toBe(recents[0]);
    await userEvent.tab();
    await expect(document.activeElement).toBe(recents[1]);

    // And a Place still navigates.
    await userEvent.click(places[1]);
    await waitFor(() => expect(q("crumbs")!.querySelector('[data-slot="breadcrumb-page"]')).toHaveTextContent("bam"));
  },
};
