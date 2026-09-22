/**
 * Components/Blocks/BlockRegion/Views — BlockRegion's three views, switched
 * from a dropdown in the story's own canvas.
 *
 * Zach, 2026-09-22: "regions do not have a simple view. they just have port,
 * expanded and expanded opaque view. In order to allow the user to see this
 * in the story. Please just put a drop down menu within the story that they
 * can use to switch between stages." In the app that switch is the floating
 * toolbar's S | P | E selector; here it is a stock `Select` above the region,
 * deliberately NOT a Storybook args control, so it sits where he looks.
 *
 * ONE state drives both controls: the dropdown and the Blackbox toggle write
 * the same `view`, so pressing the toggle moves the dropdown and picking in
 * the dropdown moves the toggle.
 *
 * Every assertion MEASURES (`getBoundingClientRect`, `getComputedStyle`).
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Block } from "./block";
import { BlockRegion, type RegionKind } from "./blockRegion";
import type { BlockMember } from "./blockMembers";
import type { PortEdgeItem } from "./portEdge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

const meta = {
  title: "Components/Blocks/BlockRegion/Views",
  tags: ["object:region", "lane:blockregion-views"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/* The view switch                                                      */
/* ------------------------------------------------------------------ */

type StoryView = "port" | "expanded" | "expanded-opaque";

const VIEW_ITEMS: Record<StoryView, string> = {
  port: "Port",
  expanded: "Expanded",
  "expanded-opaque": "Expanded Opaque",
};

const STORAGE_KEY = "bbox:blockregion-views:view";

function isStoryView(value: unknown): value is StoryView {
  return value === "port" || value === "expanded" || value === "expanded-opaque";
}

// WHY try/catch around both: storage can throw outright (a private window,
// blocked site data, a sandboxed preview) and the story must still render
// on the default view when it does.
function readStoredView(): StoryView {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isStoryView(stored) ? stored : "expanded";
  } catch {
    return "expanded";
  }
}

function writeStoredView(view: StoryView): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Remembering the choice is a convenience; failing to is not an error.
  }
}

interface RegionBench {
  id: string;
  kind: RegionKind;
  title: string;
  type?: string;
  glyph?: string;
  width: number;
  height: number;
  members?: BlockMember[];
  controlPorts?: PortEdgeItem[];
  boundaryPorts?: Partial<Record<"left" | "right", PortEdgeItem[]>>;
}

function ViewsBench({ bench }: { bench: RegionBench }) {
  const [view, setViewState] = useState<StoryView>(readStoredView);
  const setView = (next: StoryView) => {
    setViewState(next);
    writeStoredView(next);
  };
  const { width, height, ...region } = bench;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24 }}>
      <Select value={view} items={VIEW_ITEMS} onValueChange={(next) => isStoryView(next) && setView(next)}>
        <SelectTrigger aria-label="View" style={{ width: 200 }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(VIEW_ITEMS) as StoryView[]).map((value) => (
            <SelectItem key={value} value={value}>
              {VIEW_ITEMS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <BlockRegion
        {...region}
        width={width}
        height={height}
        view={view === "port" ? "port" : view === "expanded" ? "expanded" : "opaque"}
        opaqueFace="frame"
        onToggleView={() => setView(view === "expanded" ? "expanded-opaque" : "expanded")}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

function Member({ label }: { label: string }) {
  return <Block header={<span style={{ fontSize: 13 }}>{label}</span>} width={130} />;
}

/** Zach's "Blockregion Empty" screenshot: a frame, a corner tab reading
 *  `Group`, nothing inside — minus the chevron he asked to lose. */
const EMPTY_BENCH: RegionBench = { id: "group", kind: "group", title: "Group", width: 400, height: 260 };

const POPULATED_BENCH: RegionBench = {
  id: "loop",
  kind: "loop",
  title: "For Loop",
  type: "for",
  glyph: "lucide:repeat",
  width: 460,
  height: 280,
  controlPorts: [{ id: "Iterable", label: "Iterable" }],
  boundaryPorts: { left: [{ id: "merge/pose", label: "pose" }], right: [{ id: "smooth/out", label: "out" }] },
  members: [
    { id: "merge", x: 40, y: 24, content: <Member label="merge" /> },
    { id: "smooth", x: 230, y: 24, content: <Member label="smooth" /> },
  ],
};

/* ------------------------------------------------------------------ */
/* Measured helpers                                                     */
/* ------------------------------------------------------------------ */

const TOLERANCE_PX = 2;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function regionOf(canvasElement: HTMLElement, id: string): HTMLElement {
  return required<HTMLElement>(canvasElement, `[data-slot="region"][data-region-id="${id}"]`, `region \`${id}\``);
}

async function chooseView(canvasElement: HTMLElement, label: string): Promise<void> {
  const trigger = await within(canvasElement).findByRole("combobox", { name: "View" });
  await userEvent.click(trigger);
  await userEvent.click(await within(document.body).findByRole("option", { name: label }));
  await waitFor(() => expect(trigger.textContent).toContain(label));
}

/** No chevron may sit anywhere on a region that has no arms: every
 *  `folding-chevron` inside it would be a REGION-level control, which is
 *  exactly what Zach asked to lose. */
function expectNoChevron(region: HTMLElement): void {
  expect(region.querySelectorAll('[data-slot="folding-chevron"]'), "chevrons on the region").toHaveLength(0);
}

/** The toggle sits INSIDE `box`'s top-right corner: within its right and top
 *  edges, and no further than 12px from either. */
function expectToggleInTopRight(toggle: HTMLElement, box: HTMLElement): void {
  const t = toggle.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  expect(t.right, "toggle's right edge inside the frame").toBeLessThanOrEqual(b.right + TOLERANCE_PX);
  expect(t.top, "toggle's top edge inside the frame").toBeGreaterThanOrEqual(b.top - TOLERANCE_PX);
  expect(b.right - t.right, "toggle hugs the right wall").toBeLessThanOrEqual(12);
  expect(t.top - b.top, "toggle hugs the top wall").toBeLessThanOrEqual(12);
  expect(t.width).toBeGreaterThan(0);
}

/** Zach: "not have the background be a lighter grey… more seamless". The
 *  pointer is moved off first so the hover ring is not what gets measured,
 *  and the check waits out the Button's `transition-all`. */
async function expectSeamlessPressed(toggle: HTMLElement, face: HTMLElement): Promise<void> {
  await userEvent.unhover(toggle);
  await waitFor(() => {
    const background = getComputedStyle(toggle).backgroundColor;
    const faceBackground = getComputedStyle(face).backgroundColor;
    expect(
      background === "rgba(0, 0, 0, 0)" || background === "transparent" || background === faceBackground,
      `pressed toggle background ${background} vs frame ${faceBackground}`,
    ).toBe(true);
  });
}

async function expectPort(canvasElement: HTMLElement, id: string, withSplit: boolean): Promise<void> {
  await chooseView(canvasElement, "Port");
  const region = regionOf(canvasElement, id);
  await waitFor(() => expect(region.getAttribute("data-region-view")).toBe("port"));
  expect(region.querySelector('[data-slot="region-frame"]'), "no frame in Port").toBeNull();
  expect(region.querySelectorAll("[data-member-id]"), "no members in Port").toHaveLength(0);
  expect(region.querySelector('[data-slot="region-blackbox-toggle"]'), "no Blackbox toggle in Port").toBeNull();
  const card = required<HTMLElement>(region, `[data-block-id="${id}"] [data-slot="block"]`, "the port card");
  if (withSplit) {
    // The split line is a real painted rule across the card, between the
    // control port and the ordinary ones.
    const split = required<HTMLElement>(region, '[data-slot="region-control-split"]', "the split line").getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    expect(split.height).toBeGreaterThan(0);
    expect(split.width).toBeGreaterThan(cardRect.width * 0.8);
    const control = required<HTMLElement>(region, '[data-port-id="Iterable"]', "the control port").getBoundingClientRect();
    const ordinary = required<HTMLElement>(region, '[data-port-id="merge/pose"]', "an ordinary port").getBoundingClientRect();
    expect(control.top + control.height / 2, "control port above the line").toBeLessThan(split.top);
    expect(ordinary.top + ordinary.height / 2, "ordinary port below the line").toBeGreaterThan(split.bottom);
  }
  expectNoChevron(region);
}

async function expectExpanded(canvasElement: HTMLElement, id: string, memberIds: string[]): Promise<HTMLElement> {
  const region = regionOf(canvasElement, id);
  await waitFor(() => expect(region.getAttribute("data-region-view")).toBe("expanded"));
  const frame = required<HTMLElement>(region, '[data-slot="region-frame"]', "the frame");
  expect(Array.from(region.querySelectorAll("[data-member-id]")).map((m) => m.getAttribute("data-member-id"))).toEqual(memberIds);
  for (const memberId of memberIds) {
    const member = required<HTMLElement>(region, `[data-member-id="${memberId}"]`, `member ${memberId}`).getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    expect(member.left >= f.left && member.right <= f.right && member.top >= f.top && member.bottom <= f.bottom, `${memberId} inside the frame`).toBe(true);
  }
  const toggle = required<HTMLElement>(region, '[aria-label="Blackbox toggle"]', "the Blackbox toggle");
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  expect(toggle.querySelector("svg")?.getAttribute("fill"), "hollow square").toBe("none");
  expectToggleInTopRight(toggle, frame);
  expectNoChevron(region);
  return toggle;
}

async function expectExpandedOpaque(canvasElement: HTMLElement, id: string, title: string): Promise<HTMLElement> {
  const region = regionOf(canvasElement, id);
  await waitFor(() => expect(region.getAttribute("data-region-opaque-face")).toBe("frame"));
  expect(region.getAttribute("data-region-view")).toBe("opaque");
  expect(region.querySelectorAll("[data-member-id]"), "members hidden").toHaveLength(0);
  const face = required<HTMLElement>(region, '[data-slot="region-opaque-face"] [data-slot="block"]', "the opaque face");
  const titleBox = required<HTMLElement>(region, '[data-slot="region-opaque-title"]', "the centred title");
  expect(required<HTMLElement>(titleBox, '[data-slot="region-opaque-title-name"]', "the title").textContent).toBe(title);
  const f = face.getBoundingClientRect();
  const t = titleBox.getBoundingClientRect();
  expect(Math.abs(t.left + t.width / 2 - (f.left + f.width / 2)), "title centred horizontally").toBeLessThanOrEqual(TOLERANCE_PX);
  expect(Math.abs(t.top + t.height / 2 - (f.top + f.height / 2)), "title centred vertically").toBeLessThanOrEqual(TOLERANCE_PX);
  const toggle = required<HTMLElement>(region, '[aria-label="Blackbox toggle"]', "the Blackbox toggle");
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  expect(toggle.querySelector("svg")?.getAttribute("fill"), "filled square").toBe("currentColor");
  expectToggleInTopRight(toggle, face);
  await expectSeamlessPressed(toggle, face);
  expectNoChevron(region);
  return toggle;
}

/** The whole round: every view from the dropdown, then the toggle
 *  Expanded → Opaque → Expanded with the dropdown following it. */
async function playViews(canvasElement: HTMLElement, bench: RegionBench, withSplit: boolean): Promise<void> {
  const memberIds = (bench.members ?? []).map((member) => member.id);
  const trigger = await within(canvasElement).findByRole("combobox", { name: "View" });

  await expectPort(canvasElement, bench.id, withSplit);

  await chooseView(canvasElement, "Expanded Opaque");
  await expectExpandedOpaque(canvasElement, bench.id, bench.title);

  await chooseView(canvasElement, "Expanded");
  const toggle = await expectExpanded(canvasElement, bench.id, memberIds);

  // One state: the toggle moves the view AND the dropdown.
  await userEvent.click(toggle);
  const pressed = await expectExpandedOpaque(canvasElement, bench.id, bench.title);
  await waitFor(() => expect(trigger.textContent).toContain("Expanded Opaque"));

  await userEvent.click(pressed);
  await expectExpanded(canvasElement, bench.id, memberIds);
  await waitFor(() => {
    expect(trigger.textContent).toContain("Expanded");
    expect(trigger.textContent).not.toContain("Opaque");
  });
}

/* ------------------------------------------------------------------ */
/* Stories                                                             */
/* ------------------------------------------------------------------ */

export const Empty: Story = {
  name: "Empty",
  render: () => <ViewsBench bench={EMPTY_BENCH} />,
  play: async ({ canvasElement }) => {
    await playViews(canvasElement, EMPTY_BENCH, false);
  },
};

export const WithMembersAndPorts: Story = {
  name: "With members and ports",
  render: () => <ViewsBench bench={POPULATED_BENCH} />,
  play: async ({ canvasElement }) => {
    await playViews(canvasElement, POPULATED_BENCH, true);
  },
};
