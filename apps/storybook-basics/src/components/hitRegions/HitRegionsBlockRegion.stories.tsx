/**
 * Components/Blocks/BlockRegion/Hit Regions — the real `BlockRegion` in
 * Port, Expanded and Expanded Opaque, and which parts of it pass a press
 * through to the children and which stay on top.
 *
 * Zach, 2026-09-22: "Particularly the region/expanded views are important
 * because its like what will go through to the children and what will stay
 * on top?" And, earlier the same day, of the corner card: "when you hover on
 * the corner block its the entire out frame that should become highlighted".
 *
 * WHAT DECIDES EACH ANSWER: the harness, never this file. Each region and
 * each member is stamped with its declaration (`nodeRoot`), and every point
 * is resolved through the browser's own `elementFromPoint` plus
 * `hosts/grabChain.ts`'s nearest-declaration walk over `HIT_DECLARATIONS`
 * (`dragPolicy.ts`'s rows plus the two region rows the harness documents).
 * In Expanded:
 *   PASSES THROUGH — the free body between members, every open arm's body.
 *   STAYS ON TOP   — the corner card (selects the WHOLE frame), each arm's
 *                    header row (selects the whole frame), the frame's own
 *                    border (selects the whole frame).
 *   OWNS ITS PRESS — the Blackbox toggle, each arm's fold chevron, every
 *                    port dot on the corner card.
 *   A MEMBER       — its own node: the press selects the member, not the
 *                    region around it.
 * In Port and Expanded Opaque nothing passes through: the inside is hidden.
 *
 * WHAT THIS IS NOT: a capture of a canvas host on this base. The tldraw
 * host draws a region as one `Rectangle2d` with `isFilled: true`
 * (hosts/tldrawHost.tsx, `getGeometry`) and `contentOwnsPress` returns
 * `false` for a region outside `nodrag`/rails — so there, today, a press on
 * the empty interior still reaches tldraw and selects the region. This story
 * shows the declared policy, resolved against the real DOM; the tldraw host
 * is owed the same rule.
 *
 * On the region's fold control (dispatcher, 2026-09-22 — Zach ruled regions
 * have NO fold chevron): BlockRegion draws none, so none is a target here.
 * The `folding-chevron` row in the region declaration is the ARM rows' own
 * fold (blockRegion.tsx's `ArmRow`), which Zach's ruling keeps. The Blackbox
 * toggle is an on-top, content-owned control: `owns-pointer`.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";

import { Block } from "../block";
import { BlockRegion, type RegionArm, type RegionView } from "../blockRegion";
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
  title: "Components/Blocks/BlockRegion/Hit Regions",
  tags: ["object:region", "lane:hit-regions-views"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

type PanelView = "port" | "expanded" | "expanded-opaque";

const VIEW_OPTIONS: { value: PanelView; label: string }[] = [
  { value: "port", label: "Port" },
  { value: "expanded", label: "Expanded" },
  { value: "expanded-opaque", label: "Expanded Opaque" },
];

/** The region's declaration per view — its meaning, not a hit map. */
const DECLARATION_FOR: Record<PanelView, string> = {
  port: "region:opaque",
  expanded: "region:expanded",
  "expanded-opaque": "region:opaque",
};

const REGION_VIEW_FOR: Record<PanelView, RegionView> = {
  port: "port",
  expanded: "expanded",
  "expanded-opaque": "opaque",
};

function Member({ id }: { id: string }) {
  // Its own canvas node: nearest declaration wins, so a press here selects
  // the member and never reaches the region's grab map.
  return (
    <div {...nodeRoot("block:solid")} data-testid={`member-${id}`}>
      <Block width={130} header={<Text>{id}</Text>} />
    </div>
  );
}

const LOOP_CONTROL: PortEdgeItem[] = [{ id: "Iterable", label: "Iterable", state: "wired" }];
const LOOP_BOUNDARY = { left: [{ id: "merge/pose", label: "pose" }], right: [{ id: "smooth/out", label: "out" }] };

const STAGE_W = 1010;
const STAGE_H = 470;

function RegionHitPlayground({ initialView }: { initialView: PanelView }) {
  const [view, setView] = useState<PanelView>(initialView);
  const [show, setShow] = useState(true);
  // Off by default (the brief): the outline is a question you ask, not
  // paint that should sit over the component on every visit.
  const [outline, setOutline] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [policy, setPolicy] = useState<HitPolicy>("scene");
  const [open, setOpen] = useState<Record<string, boolean>>({ if: true, elif: false, else: true });

  const arms: RegionArm[] = [
    { id: "if", title: "if fast:", members: [{ id: "estimate", x: 28, y: 18, content: <Member id="estimate" /> }] },
    { id: "elif", title: "elif cached:", members: [] },
    { id: "else", title: "else:", members: [{ id: "fallback", x: 28, y: 18, content: <Member id="fallback" /> }] },
  ].map((arm) => ({
    ...arm,
    open: open[arm.id],
    bodyHeight: 100,
    onOpenChange: (next: boolean) => setOpen((prev) => ({ ...prev, [arm.id]: next })),
  }));

  const regionView = REGION_VIEW_FOR[view];
  const toggle = () => setView(view === "expanded" ? "expanded-opaque" : "expanded");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Segmented<PanelView> ariaLabel="View" options={VIEW_OPTIONS} value={view} onChange={setView} />
        <Checkbox label="Show hit regions" checked={show} onChange={setShow} />
        <Checkbox label="Show host outline" checked={outline} onChange={setOutline} />
        <ZoomControl zoom={zoom} onChange={setZoom} />
        <PolicyControl policy={policy} onChange={setPolicy} />
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--muted-foreground)", maxWidth: 760 }}>
        no slider: BlockRegion adds no hit constant — its parts are DOM boxes and Port's halo. (The policy
        control is inert for the same reason.) Rules: the declared drag policy resolved against the real DOM —
        on this base the tldraw host still selects the region from its empty interior.
      </div>
      <DeclarationLegend declarationKey={DECLARATION_FOR[view]} />
      <RoleMapLegend />
      <HitProbe hostOutline={outline} roleMap={show} mapKey={`${view}|${zoom}|${JSON.stringify(open)}`}>
        <ZoomStage zoom={zoom} width={STAGE_W} height={STAGE_H}>
          <div style={{ display: "flex", gap: 90, alignItems: "flex-start", padding: "44px 70px", width: STAGE_W, height: STAGE_H, boxSizing: "border-box" }}>
            <div {...nodeRoot(DECLARATION_FOR[view])} data-testid="node-loop">
              <BlockRegion
                id="loop"
                kind="loop"
                title="For Loop"
                type="for"
                glyph="lucide:repeat"
                view={regionView}
                opaqueFace="frame"
                width={420}
                height={250}
                controlPorts={LOOP_CONTROL}
                boundaryPorts={LOOP_BOUNDARY}
                members={[
                  { id: "merge", x: 40, y: 24, content: <Member id="merge" /> },
                  { id: "smooth", x: 240, y: 24, content: <Member id="smooth" /> },
                ]}
                onToggleView={toggle}
              />
            </div>
            <div {...nodeRoot(DECLARATION_FOR[view])} data-testid="node-branch">
              <BlockRegion
                id="branch"
                kind="branch"
                title="Branch"
                type="if"
                view={regionView}
                opaqueFace="frame"
                width={360}
                arms={arms}
                onToggleView={toggle}
              />
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


async function stageFor(canvasElement: HTMLElement, view: RegionView) {
  await within(canvasElement).findByRole("group", { name: "View" });
  canvasElement.scrollIntoView({ block: "center" });
  await turnOnHostOutline(canvasElement);
  const stage = required<HTMLElement>(canvasElement, '[data-slot="hit-probe-stage"]', "the stage");
  await waitFor(() => {
    for (const id of ["loop", "branch"]) {
      expect(required<HTMLElement>(stage, `[data-slot="region"][data-region-id="${id}"]`, `region ${id}`).getAttribute("data-region-view")).toBe(view);
    }
  });
  return stage;
}

async function probeAt(stage: HTMLElement, element: Element, what: string, at?: { x: number; y: number }) {
  const point = at ?? pointIn(element);
  const hit = await probeHost(stage, point.x, point.y);
  expect(hit.top, `${what}: elementFromPoint lands on it`).not.toBeNull();
  expect(element.contains(hit.top!) || element === hit.top, `${what}: elementFromPoint lands on it`).toBe(true);
  return hit;
}

function expectOutline(hit: Awaited<ReturnType<typeof probeHost>>, expected: Element, what: string) {
  expect(hit.outline, `${what}: an outline is drawn`).not.toBeNull();
  const drawn = hit.outline!;
  const target = expected.getBoundingClientRect();
  expect(
    sameBox(drawn, target),
    `${what}: outline ${drawn.left.toFixed(1)},${drawn.top.toFixed(1)} ${drawn.width.toFixed(1)}×${drawn.height.toFixed(1)} vs ${target.left.toFixed(1)},${target.top.toFixed(1)} ${target.width.toFixed(1)}×${target.height.toFixed(1)}`,
  ).toBe(true);
}

/* ------------------------------------------------------------------ */
/* Stories                                                             */
/* ------------------------------------------------------------------ */

export const Expanded: Story = {
  render: () => <RegionHitPlayground initialView="expanded" />,
  play: async ({ canvasElement }) => {
    const stage = await stageFor(canvasElement, "expanded");
    const loop = required<HTMLElement>(stage, '[data-region-id="loop"][data-slot="region"]', "the loop");
    const loopFrame = required<HTMLElement>(loop, '[data-slot="region-frame"]', "the loop's frame");

    // STAYS ON TOP — the corner card outlines the WHOLE frame, not itself.
    const cornerHeader = required<HTMLElement>(loop, '[data-slot="region-corner"] [data-slot="block-header"]', "the corner card's header");
    const corner = await probeAt(stage, cornerHeader, "corner card");
    expect(corner.kind).toBe("node");
    expect(corner.via).toBe("region-corner");
    expectOutline(corner, loopFrame, "corner card → frame");
    const cornerCard = required<HTMLElement>(loop, '[data-slot="region-corner"] [data-slot="block"]', "the corner card");
    expect(sameBox(corner.outline!, cornerCard.getBoundingClientRect()), "not the card's own box").toBe(false);

    // A MEMBER — its own box.
    const merge = required<HTMLElement>(stage, '[data-testid="member-merge"] [data-slot="block"]', "member merge");
    const member = await probeAt(stage, merge, "member");
    expect(member.kind).toBe("node");
    expect(member.owner).toBe("Block (view=simple|port|value)");
    expectOutline(member, merge, "member");

    // PASSES THROUGH — the empty body: no outline.
    const emptyPoint = pointIn(required<HTMLElement>(loop, '[data-slot="region-body"]', "the loop body"), 0.5, 0.9);
    const empty = await probeHost(stage, emptyPoint.x, emptyPoint.y);
    expect(empty.top?.closest('[data-slot="region-body"]'), "the point is in the body").not.toBeNull();
    expect(empty.top?.closest('[data-slot="block-member"]'), "...and on no member").toBeNull();
    expect(empty.kind).toBe("pass-through");
    expect(empty.via).toBe("region-body");
    expect(empty.outline, "no outline for a pass-through").toBeNull();

    // STAYS ON TOP — the frame's own border, the whole frame.
    // The border is one CSS px wide, so find its pixel rather than guess a
    // sub-pixel offset: scan across the left edge at mid-height.
    const edge = pointIn(loopFrame, 0, 0.5, "start");
    let onBorder: { x: number; y: number } | null = null;
    for (let x = edge.x - 1; x <= edge.x + 2 && !onBorder; x += 0.25) {
      if (document.elementFromPoint(x, edge.y) === loopFrame) onBorder = { x, y: edge.y };
    }
    expect(onBorder, "a point on the frame's own left border").not.toBeNull();
    const border = await probeHost(stage, onBorder!.x, onBorder!.y);
    expect(border.top).toBe(loopFrame);
    expect(border.via).toBe("region-frame-border");
    expectOutline(border, loopFrame, "frame border");

    // OWNS ITS PRESS — the Blackbox toggle and a corner port dot.
    const toggle = required<HTMLElement>(loop, '[aria-label="Blackbox toggle"]', "the toggle");
    const toggleHit = await probeAt(stage, toggle, "toggle");
    expect(toggleHit.kind).toBe("part");
    expect(toggleHit.via).toBe("region-blackbox-toggle");
    expect(toggleHit.outlineKind).toBe("part");
    const dot = required<HTMLElement>(loop, '[data-slot="port-dot"]', "a corner port dot");
    const dotHit = await probeAt(stage, dot, "corner port dot");
    expect(dotHit.kind).toBe("part");

    // The branch: arm header → whole frame; chevron owns; arm body passes.
    const branch = required<HTMLElement>(stage, '[data-region-id="branch"][data-slot="region"]', "the branch");
    const branchFrame = required<HTMLElement>(branch, '[data-slot="region-frame"]', "the branch frame");
    const armTitle = required<HTMLElement>(branch, '[data-arm-id="if"] [data-slot="region-arm-title"]', "the if arm title");
    const armHit = await probeAt(stage, armTitle, "arm header");
    expect(armHit.via).toBe("region-arm-header");
    expectOutline(armHit, branchFrame, "arm header → frame");
    const chevron = required<HTMLElement>(branch, '[data-arm-id="if"] [data-slot="folding-chevron"]', "the if chevron");
    const chevronHit = await probeAt(stage, chevron, "chevron");
    expect(chevronHit.kind).toBe("part");
    expect(chevronHit.via).toBe("folding-chevron");
    const armPoint = pointIn(required<HTMLElement>(branch, '[data-arm-id="if"] [data-slot="region-arm-body"]', "the if arm body"), 0.85, 0.85);
    const armEmpty = await probeHost(stage, armPoint.x, armPoint.y);
    expect(armEmpty.top?.closest('[data-slot="block-member"]')).toBeNull();
    expect(armEmpty.kind).toBe("pass-through");
    expect(armEmpty.outline).toBeNull();
    const estimate = required<HTMLElement>(stage, '[data-testid="member-estimate"] [data-slot="block"]', "member estimate");
    expectOutline(await probeAt(stage, estimate, "arm member"), estimate, "arm member");
  },
};

export const ExpandedOpaque: Story = {
  name: "Expanded Opaque",
  render: () => <RegionHitPlayground initialView="expanded-opaque" />,
  play: async ({ canvasElement }) => {
    const stage = await stageFor(canvasElement, "opaque");
    const loop = required<HTMLElement>(stage, '[data-region-id="loop"][data-slot="region"]', "the loop");
    const face = required<HTMLElement>(loop, '[data-slot="region-opaque-face"] [data-slot="block"]', "the opaque face");
    // Nothing passes through: where the members were, the face selects the
    // whole region.
    const inside = pointIn(face, 0.7, 0.75);
    const interior = await probeHost(stage, inside.x, inside.y);
    expect(interior.kind).toBe("node");
    expectOutline(interior, face, "opaque interior");
    const toggleHit = await probeAt(stage, required<HTMLElement>(loop, '[aria-label="Blackbox toggle"]', "the toggle"), "toggle");
    expect(toggleHit.kind).toBe("part");
  },
};

export const Port: Story = {
  render: () => <RegionHitPlayground initialView="port" />,
  play: async ({ canvasElement }) => {
    const stage = await stageFor(canvasElement, "port");
    const loop = required<HTMLElement>(stage, '[data-region-id="loop"][data-slot="region"]', "the loop");
    const card = required<HTMLElement>(loop, '[data-block-id="loop"] > [data-slot="block"]', "the port card");
    const header = required<HTMLElement>(card, ':scope > [data-slot="block-header"]', "the card header");
    const hit = await probeAt(stage, header, "port card");
    expect(hit.kind).toBe("node");
    expectOutline(hit, card, "port card");
    const dotHit = await probeAt(stage, required<HTMLElement>(loop, '[data-slot="port-dot"]', "a card dot"), "card dot");
    expect(dotHit.kind).toBe("part");
  },
};
