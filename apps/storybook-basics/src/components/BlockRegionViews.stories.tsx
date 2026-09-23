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
import { BlockPort } from "./blockPort";
import { BlockRegion, type RegionKind } from "./blockRegion";
import type { BlockMember } from "./blockMembers";
import type { PortEdgeItem } from "./portEdge";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
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

/* ------------------------------------------------------------------ */
/* The corner's size, and who measures it (Codex audit + re-judges)       */
/* ------------------------------------------------------------------ */

function regionBox(region: HTMLElement): DOMRect {
  const box =
    region.querySelector<HTMLElement>(':scope > [data-slot="region-opaque-face"]') ??
    required<HTMLElement>(region, ':scope > [data-slot="region-frame"]', "the frame");
  return box.getBoundingClientRect();
}

async function pressToggle(region: HTMLElement, expectView: "expanded" | "opaque"): Promise<void> {
  await userEvent.click(required<HTMLElement>(region, '[aria-label="Blackbox toggle"]', "the toggle"));
  await waitFor(() => expect(region.getAttribute("data-region-view")).toBe(expectView));
}

function expectSameBox(a: DOMRect, b: DOMRect, what: string): void {
  expect(Math.abs(a.width - b.width), `${what}: width`).toBeLessThanOrEqual(1);
  expect(Math.abs(a.height - b.height), `${what}: height`).toBeLessThanOrEqual(1);
}

/** The kit's own corner, as data (`cornerCard`): a card with two ports, NO
 *  `height` and NO `cornerSize`, loaded straight into Expanded Opaque. */
function KitCornerBench() {
  const [opaque, setOpaque] = useState(true);
  return (
    <div style={{ padding: 24 }}>
      <BlockRegion
        id="kit"
        kind="group"
        view={opaque ? "opaque" : "expanded"}
        opaqueFace="frame"
        width={360}
        title="Kit"
        cornerCard={{ header: "Kit corner", width: 170, edges: { left: { items: [{ id: "a", label: "a" }, { id: "b", label: "b" }] } }, bandHeight: 64 }}
        boundaryPorts={{ left: [{ id: "a", label: "a" }, { id: "b", label: "b" }] }}
        members={[{ id: "m", x: 24, y: 16, content: <Member label="m" /> }]}
        onToggleView={() => setOpaque((value) => !value)}
      />
    </div>
  );
}

export const KitCornerLoadedOpaque: Story = {
  name: "The kit's corner, loaded opaque, no height — the box holds",
  render: () => <KitCornerBench />,
  play: async ({ canvasElement }) => {
    const region = regionOf(canvasElement, "kit");
    await waitFor(() => expect(region.getAttribute("data-region-view")).toBe("opaque"));

    // The measuring copy is BlockRegion's own content, built without a
    // `BlockPort`: nothing in it that wireLayer's `[data-block-id]` →
    // `[data-port-id]` walk could resolve.
    const twin = required<HTMLElement>(region, '[data-slot="region-corner-measure"]', "the corner's measuring copy");
    expect(twin.querySelectorAll("[data-block-id]"), "copy block ids").toHaveLength(0);
    expect(twin.querySelectorAll("[data-port-id]"), "copy port ids").toHaveLength(0);
    expect(twin.querySelectorAll('[data-slot="port-dot"]'), "copy port dots").toHaveLength(0);
    expect(region.querySelectorAll('[data-block-id="kit"]'), "exactly one owner of the region id").toHaveLength(1);

    const first = regionBox(region);
    await pressToggle(region, "expanded");
    expectSameBox(regionBox(region), first, "expanded keeps the box it was loaded at");
    await pressToggle(region, "opaque");
    expectSameBox(regionBox(region), first, "opaque again keeps the same box");
  },
};

/**
 * An ARBITRARY corner — the caller's own node, holding a controlled-open
 * Popover that portals to `document.body`. BlockRegion must never copy it:
 * a copy's portal escapes every hiding ancestor and becomes a second,
 * visible, focusable popover. The types force this caller to pass
 * `cornerSize` (its view can be opaque), so nothing is measured at all.
 */
function PopoverCornerBench() {
  const [opaque, setOpaque] = useState(false);
  return (
    <div style={{ padding: 24 }}>
      <BlockRegion
        id="pop"
        kind="group"
        view={opaque ? "opaque" : "expanded"}
        opaqueFace="frame"
        width={360}
        title="Popover"
        cornerSize={{ w: 170, h: 80 }}
        corner={
          <BlockPort id="pop" view="port" edges={{ left: { items: [{ id: "a", label: "a" }] } }}>
            <Block
              header={
                <Popover open>
                  <PopoverTrigger render={<span />}>Corner</PopoverTrigger>
                  <PopoverContent autoFocus={false}>
                    <span data-testid="corner-popover">the corner's popover</span>
                  </PopoverContent>
                </Popover>
              }
              width={170}
              body={<div style={{ height: 32 }} />}
              shape="region-corner"
            />
          </BlockPort>
        }
        boundaryPorts={{ left: [{ id: "a", label: "a" }] }}
        members={[{ id: "m", x: 24, y: 16, content: <Member label="m" /> }]}
        onToggleView={() => setOpaque((value) => !value)}
      />
    </div>
  );
}

const popoverCount = () => document.body.querySelectorAll('[data-testid="corner-popover"]').length;

export const CustomCornerIsNeverCopied: Story = {
  name: "An arbitrary corner with an open popover is never copied",
  render: () => <PopoverCornerBench />,
  play: async ({ canvasElement }) => {
    const region = regionOf(canvasElement, "pop");
    await waitFor(() => expect(popoverCount(), "Expanded: the corner's one popover").toBe(1));
    const first = regionBox(region);

    // Expanded Opaque draws no corner, and copies none: the popover goes with
    // the corner rather than surviving as a hidden copy's visible portal.
    await pressToggle(region, "opaque");
    await waitFor(() => expect(popoverCount(), "Expanded Opaque: no copy, so no popover").toBe(0));
    expect(region.querySelector('[data-slot="region-corner-measure"]'), "no measuring copy of an arbitrary corner").toBeNull();
    expectSameBox(regionBox(region), first, "cornerSize holds the box");

    await pressToggle(region, "expanded");
    await waitFor(() => expect(popoverCount(), "back to Expanded: still exactly one").toBe(1));
  },
};

/** `cornerSize` given: nothing is measured, so nothing is mounted to measure —
 *  for BlockRegion's own title card and for a `cornerCard` alike. */
export const SizedCornerIsNotMeasured: Story = {
  name: "A sized corner mounts no measuring copy while opaque",
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>
      <BlockRegion id="sized-title" kind="group" view="opaque" opaqueFace="frame" width={300} title="Sized title" cornerSize={{ w: 120, h: 40 }} />
      <BlockRegion
        id="sized-card"
        kind="group"
        view="opaque"
        opaqueFace="frame"
        width={300}
        cornerCard={{ header: "Sized card", bandHeight: 40 }}
        cornerSize={{ w: 160, h: 80 }}
      />
      <BlockRegion id="unsized-title" kind="group" view="opaque" opaqueFace="frame" width={300} title="Unsized title" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const id of ["sized-title", "sized-card"]) {
      const region = regionOf(canvasElement, id);
      await waitFor(() => expect(region.getAttribute("data-region-view")).toBe("opaque"));
      expect(region.querySelector('[data-slot="region-corner-measure"]'), `${id}: no measuring copy`).toBeNull();
    }
    // The control: without `cornerSize` the same view does mount one.
    required(regionOf(canvasElement, "unsized-title"), '[data-slot="region-corner-measure"]', "the unsized region's measuring copy");
  },
};

/* ------------------------------------------------------------------ */
/* Rich title / header content is never copied either (Codex re-judge 3) */
/* ------------------------------------------------------------------ */

/** An open Popover, portalled to `document.body`, marked by `testId`. */
function OpenPopover({ testId, label }: { testId: string; label: string }) {
  return (
    <Popover open>
      <PopoverTrigger render={<span />}>{label}</PopoverTrigger>
      <PopoverContent autoFocus={false}>
        <span data-testid={testId}>{label}'s popover</span>
      </PopoverContent>
    </Popover>
  );
}

const countOf = (testId: string) => document.body.querySelectorAll(`[data-testid="${testId}"]`).length;

/**
 * Loaded straight into Expanded Opaque, with an open Popover in the `title`
 * and one in a `cornerCard.header`. The types only accept that with
 * `cornerSize` (`blockRegion.types.test.ts` pins the refusal without it), so
 * nothing is copied to measure: zero popovers while opaque. The third region
 * reaches past the types with a cast — the runtime guard (`primitiveOnly`)
 * must still keep its node out of the copy.
 */
function RichContentBench() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>
      <BlockRegion id="rich-title" kind="group" view="opaque" opaqueFace="frame" width={300} title={<OpenPopover testId="title-popover" label="Title" />} cornerSize={{ w: 120, h: 40 }} />
      <BlockRegion
        id="rich-header"
        kind="group"
        view="opaque"
        opaqueFace="frame"
        width={300}
        cornerCard={{ header: <OpenPopover testId="header-popover" label="Header" />, bandHeight: 32 }}
        cornerSize={{ w: 160, h: 72 }}
      />
      <BlockRegion
        id="cast-title"
        kind="group"
        view="opaque"
        opaqueFace="frame"
        width={300}
        // Deliberately past the types — what an `any` from elsewhere would do.
        title={(<OpenPopover testId="cast-popover" label="Cast" />) as unknown as string}
      />
    </div>
  );
}

export const RichContentIsNeverCopied: Story = {
  name: "Rich title / header content is never copied while opaque",
  render: () => <RichContentBench />,
  play: async ({ canvasElement }) => {
    for (const id of ["rich-title", "rich-header", "cast-title"]) {
      await waitFor(() => expect(regionOf(canvasElement, id).getAttribute("data-region-view")).toBe("opaque"));
    }
    // Sized: nothing is measured, so nothing is mounted.
    for (const id of ["rich-title", "rich-header"]) {
      expect(regionOf(canvasElement, id).querySelector('[data-slot="region-corner-measure"]'), `${id}: no measuring copy`).toBeNull();
    }
    // Let any portal mount before counting — a copy's popover would appear
    // in `document.body`, not under the region.
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    // The TITLE is also the Expanded Opaque face's own centred title
    // (`RegionOpaqueTitle`) — real, visible content — so exactly ONE popover:
    // the face's. A copy would make it two.
    expect(countOf("title-popover"), "a rich title's popover while opaque: the face's own, no copy").toBe(1);
    // The HEADER lives only on the corner, which the opaque face does not
    // draw — so none at all.
    expect(countOf("header-popover"), "a rich header's popover while opaque").toBe(0);
    // Unsized and cast past the types: a copy IS mounted, but renders no node.
    const copy = required<HTMLElement>(regionOf(canvasElement, "cast-title"), '[data-slot="region-corner-measure"]', "the cast region's copy");
    expect(copy.querySelector("[data-testid], button, [aria-haspopup]"), "the copy holds no node from the title").toBeNull();
    expect(countOf("cast-popover"), "a cast title's popover while opaque: the face's own, no copy").toBe(1);
  },
};

/**
 * Codex re-judge 4: the chips too. An open Popover smuggled in as the badge
 * and as a mark — past the types with a cast — in a `cornerCard` loaded
 * straight into Expanded Opaque with no `cornerSize`, so a copy IS mounted.
 * The copy drops both (`primitiveOnly` on the badge, the `ControlMarkKind`
 * whitelist on the marks): no popover in `document.body`, and the copy keeps
 * the one genuine mark it was given.
 */
function RichChipsBench() {
  return (
    <div style={{ padding: 24 }}>
      <BlockRegion
        id="rich-chips"
        kind="loop"
        view="opaque"
        opaqueFace="frame"
        width={300}
        cornerCard={{
          header: "Loop",
          bandHeight: 32,
          chips: {
            badge: (<OpenPopover testId="badge-popover" label="Badge" />) as unknown as string,
            marks: ["break", (<OpenPopover testId="mark-popover" label="Mark" />) as unknown as "pass"],
          },
        }}
      />
    </div>
  );
}

export const RichChipsAreNeverCopied: Story = {
  name: "A rich badge or mark is never copied while opaque",
  render: () => <RichChipsBench />,
  play: async ({ canvasElement }) => {
    const region = regionOf(canvasElement, "rich-chips");
    await waitFor(() => expect(region.getAttribute("data-region-view")).toBe("opaque"));
    const copy = required<HTMLElement>(region, '[data-slot="region-corner-measure"]', "the measuring copy");
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    // The corner is not drawn while opaque, so the ONLY place either popover
    // could come from is the copy.
    expect(countOf("badge-popover"), "a rich badge's popover while opaque").toBe(0);
    expect(countOf("mark-popover"), "a rich mark's popover while opaque").toBe(0);
    expect(copy.querySelector("[data-testid], button, [aria-haspopup]"), "the copy holds no node from the chips").toBeNull();
    // The genuine mark survives the whitelist — the guard drops, it does not blank.
    expect(Array.from(copy.querySelectorAll('[data-slot="control-mark"]')).map((mark) => mark.getAttribute("data-mark"))).toEqual(["break"]);
  },
};
