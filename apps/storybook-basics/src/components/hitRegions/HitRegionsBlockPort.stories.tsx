/**
 * Components/Blocks/BlockPort/Hit Regions — ONE BlockPort in its four
 * views, and what a press on each part of it hits.
 *
 * Zach, 2026-09-22: "I really like this hit region thing you made for the
 * Block. Can you please do one for block port? Simple, port, expanded,
 * expanded opaque view?" — and, of the expanded views, "its like what will
 * go through to the children and what will stay on top?"
 *
 * WHAT DECIDES EACH ANSWER: nothing in this file. The stage stamps each
 * canvas node with its declaration (`nodeRoot`), and the harness resolves
 * every point through the browser's own `elementFromPoint` and
 * `hosts/grabChain.ts`'s nearest-declaration walk over
 * `scene/interactions/dragPolicy.ts`'s `DRAG_DECLARATIONS`:
 *   - Simple and Port are `block:solid` — the whole face selects the block.
 *   - Expanded is `block:expanded` — header, footer and port labels stay on
 *     top; the body and the members region pass the press through; each
 *     member is its own `block:solid` node, so a press on one selects IT.
 *   - Expanded Opaque is `block:solid` again: the members are hidden, so
 *     there is nothing to pass a press through to.
 * Port dots, their halos and port/group labels own their press in every
 * view. The rail's own empty margin does not — see below.
 *
 * WHY Expanded Opaque is composed here: `BlockView` on this base is
 * `simple | port | expanded` (blockPort.layout.ts:45) — BlockPort has no
 * opaque view of its own, only BlockRegion does. So this story builds the
 * face the way BlockRegion's `RegionOpaqueFrame` does: the SAME block at its
 * expanded size with the members replaced by a line saying what is hidden,
 * and the same `expanded` rails, so the four panels differ only in view.
 *
 * THE RAIL MARGIN on THIS base: `block-port-rail`'s own box is
 * `pointer-events: none` (`blockPort.tsx`'s `BlockPortRail`, the `style`
 * object passed to the rail's root div) — WHY: Zach, 2026-09-21, "a port
 * rail's empty margin no longer swallows presses". Only the dots, labels
 * and lane furniture the rail draws re-arm `pointer-events: auto` on
 * themselves. So a press on the rail's own empty margin (clear of every
 * dot and label) passes straight through to whatever is behind it — the
 * block's own face, or the canvas past the block's edge, since the rail's
 * box straddles the block's border by design. The `expectRailMargin` check
 * below measures that rather than assuming it: it locates a clear point by
 * geometry alone (never by asking `elementFromPoint` to land on the rail,
 * which after this change it never will) and asserts the press resolves
 * anywhere EXCEPT the rail. Do not revert this to "the rail owns its own
 * margin" — that was the pre-2026-09-21 behavior this file used to encode.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";

import { Block } from "../block";
import { BlockPort } from "../blockPort";
import type { BlockView } from "../blockPort.layout";
import type { PortEdgeItem } from "../portEdge";
import { Text } from "../text";
import {
  Checkbox,
  DeclarationLegend,
  HitProbe,
  PolicyControl,
  RoleMapLegend,
  Segmented,
  ZoomControl,
  ZoomStage,
  nodeRoot,
  pointIn,
  turnOnHostOutline,
  probeHost,
  sameBox,
} from "./harness.fixture";
import type { HitPolicy } from "../../scene/hitPolicy";

const meta = {
  title: "Components/Blocks/BlockPort/Hit Regions",
  tags: ["object:block", "lane:hit-regions-views"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

type PanelView = "simple" | "port" | "expanded" | "expanded-opaque";

const VIEW_OPTIONS: { value: PanelView; label: string }[] = [
  { value: "simple", label: "Simple" },
  { value: "port", label: "Port" },
  { value: "expanded", label: "Expanded" },
  { value: "expanded-opaque", label: "Expanded Opaque" },
];

/** Which declaration each view's node carries — the only per-view fact
 *  this file states, and it is the view's own meaning, not a hit map. */
const DECLARATION_FOR: Record<PanelView, string> = {
  simple: "block:solid",
  port: "block:solid",
  expanded: "block:expanded",
  "expanded-opaque": "block:solid",
};

/** The BlockPort rail rule each panel uses. Expanded Opaque keeps the
 *  expanded rails — see the file header. */
const RAILS_FOR: Record<PanelView, BlockView> = {
  simple: "simple",
  port: "port",
  expanded: "expanded",
  "expanded-opaque": "expanded",
};

const INPUTS: PortEdgeItem[] = [
  { id: "rows", label: "rows", state: "wired" },
  { id: "window", label: "window", state: "empty" },
];
const OUTPUTS: PortEdgeItem[] = [{ id: "report", label: "report", state: "wired" }];

const BLOCK_W = 360;
const EXPANDED_H = 260;
const STAGE_W = 500;
const STAGE_H = 360;

function Member({ id, label }: { id: string; label: string }) {
  // Each member is its own canvas node — nearest declaration wins, which is
  // what stops a press on it reaching the parent's grab map.
  return (
    <div {...nodeRoot("block:solid")} data-testid={`member-${id}`}>
      <Block width={120} header={<Text>{label}</Text>} />
    </div>
  );
}

const MEMBERS = [
  { id: "load", x: 40, y: 12, content: <Member id="load" label="load" /> },
  { id: "fit", x: 200, y: 12, content: <Member id="fit" label="fit" /> },
];

function Face({ view }: { view: PanelView }) {
  const header = <Text>build_report</Text>;
  const footer = <Text tone="muted">footer</Text>;
  switch (view) {
    case "simple":
      // A body so the collapsed dots (and their "+N ports" count) sit on a
      // band of their own rather than over the title.
      return <Block width={220} header={header} body={<Text tone="muted">simple</Text>} />;
    case "port":
      // Tall enough that both left ports pack inside the body band — a
      // hugging body lets the second one hang over the footer.
      return <Block width={BLOCK_W} height={150} header={header} body={<Text tone="muted">body</Text>} footer={footer} />;
    case "expanded":
      return <Block width={BLOCK_W} height={EXPANDED_H} header={header} members={MEMBERS} footer={footer} />;
    case "expanded-opaque":
      return (
        <Block
          width={BLOCK_W}
          height={EXPANDED_H}
          header={header}
          body={<Text tone="muted">2 members hidden</Text>}
          footer={footer}
        />
      );
  }
}

function BlockPortHitPlayground({ initialView }: { initialView: PanelView }) {
  const [view, setView] = useState<PanelView>(initialView);
  const [show, setShow] = useState(true);
  // Off by default (the brief): the outline is a question you ask, not
  // paint that should sit over the component on every visit.
  const [outline, setOutline] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [policy, setPolicy] = useState<HitPolicy>("scene");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Segmented<PanelView> ariaLabel="View" options={VIEW_OPTIONS} value={view} onChange={setView} />
        <Checkbox label="Show hit regions" checked={show} onChange={setShow} />
        <Checkbox label="Show host outline" checked={outline} onChange={setOutline} />
        <ZoomControl zoom={zoom} onChange={setZoom} />
        <PolicyControl policy={policy} onChange={setPolicy} />
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--muted-foreground)", maxWidth: 640 }}>
        no slider: BlockPort adds no hit constant of its own — its parts are the Block's border box and
        Port's halo, whose constant lives on the Port story. (The policy control is inert here for the
        same reason; a DOM box always scales with the transform.) The outline is the DECLARED drag policy
        (dragPolicy.ts), not a capture: on this base tldraw hides every non-header block press from the
        editor and React Flow drags only from the header.
      </div>
      <DeclarationLegend declarationKey={DECLARATION_FOR[view]} />
      <RoleMapLegend />
      <HitProbe hostOutline={outline} roleMap={show} mapKey={`${view}|${zoom}`}>
        <ZoomStage zoom={zoom} width={STAGE_W} height={STAGE_H}>
          <div style={{ padding: "40px 70px", width: STAGE_W, height: STAGE_H, boxSizing: "border-box" }}>
            <div {...nodeRoot(DECLARATION_FOR[view])} data-testid="node" data-view={view}>
              <BlockPort id="build_report" view={RAILS_FOR[view]} edges={{ left: { items: INPUTS }, right: { items: OUTPUTS } }}>
                <Face view={view} />
              </BlockPort>
            </div>
          </div>
        </ZoomStage>
      </HitProbe>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Measured helpers                                                     */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}


async function stageFor(canvasElement: HTMLElement, view: PanelView) {
  await within(canvasElement).findByRole("group", { name: "View" });
  canvasElement.scrollIntoView({ block: "center" });
  await turnOnHostOutline(canvasElement);
  const stage = required<HTMLElement>(canvasElement, '[data-slot="hit-probe-stage"]', "the stage");
  const node = required<HTMLElement>(stage, `[data-testid="node"][data-view="${view}"]`, `the ${view} node`);
  // The rails mount a render after the bands are measured.
  await waitFor(() => expect(node.querySelectorAll('[data-slot="block-port-rail"]').length).toBeGreaterThan(0));
  const block = required<HTMLElement>(node, ':scope > [data-slot="block-port"] > [data-slot="block"]', "the block");
  return { stage, node, block };
}

/** A press on `rect`'s centre selects the whole block: the outline drawn is
 *  the block's own border box, within 1px. */
async function expectSelectsBlock(stage: HTMLElement, block: HTMLElement, at: { x: number; y: number }, via: string) {
  const hit = await probeHost(stage, at.x, at.y);
  expect(hit.kind, `${via}: outcome`).toBe("node");
  expect(hit.via, `${via}: resolved part`).toBe(via);
  expect(hit.outline, `${via}: an outline is drawn`).not.toBeNull();
  expect(sameBox(hit.outline!, block.getBoundingClientRect()), `${via}: outline is the block's box`).toBe(true);
}

/** A press on a port dot is the dot's own — the host draws no node outline. */
async function expectDotOwnsPress(stage: HTMLElement, node: HTMLElement) {
  const dot = required<HTMLElement>(node, '[data-slot="block-port-rail"] [data-slot="port-dot"]', "a rail dot");
  const at = pointIn(dot);
  const hit = await probeHost(stage, at.x, at.y);
  expect(hit.top?.closest('[data-slot="port-dot"]'), "elementFromPoint lands on the dot").toBe(dot);
  expect(hit.kind).toBe("part");
  expect(["port-dot", "port-dot-halo", "port-dot-core"]).toContain(hit.via);
  expect(hit.outlineKind, "the owning part is dashed, not the node").toBe("part");
}

/**
 * The rail between dots, measured: find a point inside the left rail's own
 * box that is clear of every dot and label box (by geometry — `getBoundingClientRect`
 * on each, never by asking `elementFromPoint` to land on the rail, which it
 * no longer does now that the rail's empty margin is `pointer-events: none`
 * — see the file header), then read what the press actually resolves to.
 *
 * On this base: the empty margin passes through to whatever is behind it
 * (the block's own face, since the rail box straddles the block's border —
 * or, past the block's edge, the canvas). Two checks, at two different
 * layers, both of which the pre-2026-09-21 rail would have failed: the
 * DOM's own `elementFromPoint` chain never touches the rail, and the
 * host's declaration resolution never attributes the press to the rail
 * either.
 */
async function expectRailMargin(stage: HTMLElement, node: HTMLElement) {
  const rail = required<HTMLElement>(node, '[data-slot="block-port-rail"][data-edge="left"]', "the left rail");
  const box = rail.getBoundingClientRect();
  const claimed = Array.from(rail.querySelectorAll<HTMLElement>('[data-slot="port-dot"], [data-slot="port-label"]')).map((el) => el.getBoundingClientRect());
  let found: { x: number; y: number } | null = null;
  for (let y = box.top + 1; y < box.bottom - 1 && !found; y += 2) {
    const x = box.left + box.width / 2;
    const clearOfClaimed = claimed.every((r) => y < r.top - 1 || y > r.bottom + 1 || x < r.left - 1 || x > r.right + 1);
    if (clearOfClaimed) found = { x, y };
  }
  expect(found, "a point inside the rail's box, clear of every dot and label box").not.toBeNull();
  const top = document.elementFromPoint(found!.x, found!.y);
  expect(top?.closest('[data-slot="block-port-rail"]'), "the rail's empty margin claims nothing at the DOM level").toBeNull();
  const hit = await probeHost(stage, found!.x, found!.y);
  expect(hit.via, "the host never attributes the press to the rail either").not.toBe("block-port-rail");
}

async function expectHeaderAndDot(canvasElement: HTMLElement, view: PanelView) {
  const { stage, node, block } = await stageFor(canvasElement, view);
  const header = required<HTMLElement>(block, ':scope > [data-slot="block-header"]', "the header");
  const expectedHeaderVia = DECLARATION_FOR[view] === "block:expanded" ? "block-header" : "face";
  await expectSelectsBlock(stage, block, pointIn(header), expectedHeaderVia);
  await expectDotOwnsPress(stage, node);
  await expectRailMargin(stage, node);
  return { stage, node, block };
}

/* ------------------------------------------------------------------ */
/* Stories                                                             */
/* ------------------------------------------------------------------ */

export const Simple: Story = {
  render: () => <BlockPortHitPlayground initialView="simple" />,
  play: async ({ canvasElement }) => {
    await expectHeaderAndDot(canvasElement, "simple");
  },
};

export const Port: Story = {
  render: () => <BlockPortHitPlayground initialView="port" />,
  play: async ({ canvasElement }) => {
    const { stage, node, block } = await expectHeaderAndDot(canvasElement, "port");
    // The body is solid in Port view.
    const body = required<HTMLElement>(block, ':scope > [data-slot="block-body"]', "the body");
    await expectSelectsBlock(stage, block, pointIn(body), "face");
    // A port label grabs the block (`port-label: grab`).
    const label = required<HTMLElement>(node, '[data-slot="port-label"]', "a port label");
    const labelPoint = pointIn(label);
    const hit = await probeHost(stage, labelPoint.x, labelPoint.y);
    expect(hit.kind).toBe("node");
    expect(["port-label", "port-label-display"]).toContain(hit.via);
  },
};

export const Expanded: Story = {
  render: () => <BlockPortHitPlayground initialView="expanded" />,
  play: async ({ canvasElement }) => {
    const { stage, node, block } = await expectHeaderAndDot(canvasElement, "expanded");
    const footer = required<HTMLElement>(block, ':scope > [data-slot="block-footer"]', "the footer");
    await expectSelectsBlock(stage, block, pointIn(footer), "block-footer");

    // A member is its own node: the outline is the MEMBER's box.
    const member = required<HTMLElement>(node, '[data-testid="member-load"] [data-slot="block"]', "member load");
    const memberPoint = pointIn(member);
    const memberHit = await probeHost(stage, memberPoint.x, memberPoint.y);
    expect(memberHit.kind).toBe("node");
    expect(memberHit.owner).toBe("Block (view=simple|port|value)");
    expect(sameBox(memberHit.outline!, member.getBoundingClientRect()), "outline is the member's box").toBe(true);
    expect(sameBox(memberHit.outline!, block.getBoundingClientRect()), "not the parent's").toBe(false);

    // The hollow interior passes through: no outline at all.
    const members = required<HTMLElement>(block, ':scope > [data-slot="block-members"]', "the members region");
    const empty = pointIn(members, 0.5, 0.92);
    const emptyHit = await probeHost(stage, empty.x, empty.y);
    expect(emptyHit.top?.closest('[data-slot="block-member"]'), "the probe point is between members").toBeNull();
    expect(emptyHit.top?.closest('[data-slot="block-members"]'), "...inside the members region").not.toBeNull();
    expect(emptyHit.kind).toBe("pass-through");
    expect(emptyHit.outline).toBeNull();
  },
};

export const ExpandedOpaque: Story = {
  name: "Expanded Opaque",
  render: () => <BlockPortHitPlayground initialView="expanded-opaque" />,
  play: async ({ canvasElement }) => {
    const { stage, block } = await expectHeaderAndDot(canvasElement, "expanded-opaque");
    // Nothing passes through: the interior, where the members were, selects
    // the block — the outline is the block's box.
    const interior = pointIn(block, 0.5, 0.6);
    await expectSelectsBlock(stage, block, interior, "face");
  },
};
