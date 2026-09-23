import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Block } from "./block";
import { BlockPort } from "./blockPort";
import { FoldingChevron } from "./foldingChevron";
import type { BlockSide } from "./port.layout";
import type { PortEdgeItem } from "./portEdge";

/**
 * Components/Blocks/Block/Header Formats — `Block`'s `headerFit` prop and
 * `BlockEdgeSpec.band: "header"`, the two additions
 * docs/blockPort.layout.header.test.ts's pure geometry (commit 18ea209)
 * exists to serve. Six drawings, one story each (Zach, 2026-09-22,
 * `Pasted image 20260922184406.png`, `…184414.png`, `…184423.png`): a
 * plain header/body/footer control, ports mounted ON a full-width header,
 * the header shrunk to a "head tab" with and without a footer, a tab
 * carrying its own ports, and a bare tab with no outline at all.
 *
 * Every claim below is MEASURED off `getBoundingClientRect` /
 * `getComputedStyle`, never inferred from the DOM merely containing an
 * element — CLAUDE.md's own rule for this kit, and the reason a play
 * function's first assertion is always a `findBy` (a `getBy` first can
 * pass on an unmounted story, and a later negative assertion would then be
 * vacuously true rather than actually checking anything).
 */

/* ------------------------------------------------------------------ */
/* Measurement helpers — local to this file, same shape BlockPort.       */
/* stories.tsx's own `required`/`bandOf` use, scoped to what these six    */
/* stories need.                                                          */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function headerOf(root: ParentNode): HTMLElement {
  return required<HTMLElement>(root, '[data-slot="block-header"]', "the block header");
}

function bodyOf(root: ParentNode): HTMLElement {
  return required<HTMLElement>(root, '[data-slot="block-body"]', "the block body");
}

function blockOf(root: ParentNode): HTMLElement {
  return required<HTMLElement>(root, '[data-slot="block"]', "the Block");
}

/** A rail item's own dot centre, in viewport px — `[data-port-id]` scopes
 *  to the one item on this edge/wall, `[data-slot="port-dot"]` to its
 *  actual painted circle (not its label or hit halo). */
function dotCentre(root: ParentNode, edge: BlockSide, portId: string): { x: number; y: number } {
  const item = required<HTMLElement>(
    root,
    `[data-slot="block-port-rail"][data-edge="${edge}"] [data-port-id="${portId}"]`,
    `port "${portId}" on the ${edge} rail`,
  );
  const dot = required<HTMLElement>(item, '[data-slot="port-dot"]', `the dot for port "${portId}"`);
  const rect = dot.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function expectWithin(actual: number, lo: number, hi: number, tolerance: number, what: string): void {
  if (actual < lo - tolerance || actual > hi + tolerance) {
    throw new Error(`${what} — measured ${actual.toFixed(2)}px, expected within [${lo.toFixed(2)}, ${hi.toFixed(2)}] (±${tolerance}px)`);
  }
}

const TOLERANCE_PX = 1;

/* ------------------------------------------------------------------ */
/* Meta                                                                 */
/* ------------------------------------------------------------------ */

const meta = {
  title: "Components/Blocks/Block/Header Formats",
  // No `host:` tag: `storyOrganisation.test.ts`'s `hostsReached` earns
  // `host:dom` only for a file whose import graph reaches
  // `hosts/domCanvas.tsx` — this file renders `Block`/`BlockPort` directly,
  // the same plain-DOM story every sibling in this folder without a host
  // tag already is (e.g. `BlockPort.stories.tsx` carries none either).
  tags: ["object:block", "lane:truthful-branch-viz"],
  component: Block,
} satisfies Meta<typeof Block>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* 1 · HeaderBodyFooter — the control. Full-width header, no ports.      */
/* ------------------------------------------------------------------ */

export const HeaderBodyFooter: Story = {
  render: () => <Block header="Planner" body="Body" footer="ready" width={260} height={180} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Planner");

    const header = headerOf(canvasElement);
    const block = blockOf(canvasElement);
    // Within the Block's own 1-2px border, not byte-exact — the header
    // sits INSIDE the border box, so it is always a shade narrower than
    // the outer box it spans.
    expectWithin(header.getBoundingClientRect().width, block.getBoundingClientRect().width, block.getBoundingClientRect().width, 4, "full-width header's width vs the block's own");
  },
};

/* ------------------------------------------------------------------ */
/* 2 · PortsOnHeader — full-width header, inputs left / outputs right,   */
/* body empty. `band: "header"` on both edges.                          */
/* ------------------------------------------------------------------ */

const HEADER_INPUTS: PortEdgeItem[] = [
  { id: "in-1", label: "in 1", state: "wired" },
  { id: "in-2", label: "in 2", state: "empty" },
];
const HEADER_OUTPUTS: PortEdgeItem[] = [
  { id: "out-1", label: "out 1", state: "wired" },
  { id: "out-2", label: "out 2", state: "empty" },
];

function PortsOnHeaderDemo() {
  return (
    <BlockPort
      id="ports-on-header"
      view="port"
      edges={{
        left: { items: HEADER_INPUTS, band: "header" },
        right: { items: HEADER_OUTPUTS, band: "header" },
      }}
    >
      <Block
        // `minHeight` gives the header band enough room to hold TWO
        // stacked rail dots — a bare single line of text is only tall
        // enough for one, which is a fact about this specimen's content,
        // not a limit `band: "header"` itself imposes.
        header={<div style={{ display: "flex", alignItems: "center", minHeight: 64 }}>Planner</div>}
        body={null}
        width={280}
        height={160}
      />
    </BlockPort>
  );
}

export const PortsOnHeader: Story = {
  render: () => <PortsOnHeaderDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Planner");

    const wrapper = required<HTMLElement>(canvasElement, '[data-slot="block-port"]', "the BlockPort wrapper");
    const headerRect = headerOf(wrapper).getBoundingClientRect();
    const bodyRect = bodyOf(wrapper).getBoundingClientRect();

    for (const item of HEADER_INPUTS) {
      const { y } = dotCentre(wrapper, "left", item.id);
      expectWithin(y, headerRect.top, headerRect.bottom, TOLERANCE_PX, `left dot "${item.id}" y`);
      if (y > bodyRect.top + TOLERANCE_PX) {
        throw new Error(`left dot "${item.id}" y (${y.toFixed(2)}) landed in the body band (starts ${bodyRect.top.toFixed(2)}), not the header`);
      }
    }
    for (const item of HEADER_OUTPUTS) {
      const { y } = dotCentre(wrapper, "right", item.id);
      expectWithin(y, headerRect.top, headerRect.bottom, TOLERANCE_PX, `right dot "${item.id}" y`);
      if (y > bodyRect.top + TOLERANCE_PX) {
        throw new Error(`right dot "${item.id}" y (${y.toFixed(2)}) landed in the body band (starts ${bodyRect.top.toFixed(2)}), not the header`);
      }
    }
  },
};

/* ------------------------------------------------------------------ */
/* 3 · HeadTab — headerFit="hug", header + body + footer. A "full"       */
/* control sits alongside so the play function can prove the tab does    */
/* NOT move where the body starts — same header text, so the only        */
/* difference between the two Blocks is `headerFit` itself.              */
/* ------------------------------------------------------------------ */

function HeadTabDemo() {
  return (
    <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted-foreground)" }}>
          headerFit=&quot;hug&quot;
        </span>
        <Block header="Planner" body="Body" footer="ready" headerFit="hug" width={260} height={180} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted-foreground)" }}>
          headerFit=&quot;full&quot; (control)
        </span>
        <Block header="Planner" body="Body" footer="ready" width={260} height={180} />
      </div>
    </div>
  );
}

export const HeadTab: Story = {
  render: () => <HeadTabDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findAllByText("Planner");

    const blocks = canvasElement.querySelectorAll<HTMLElement>('[data-slot="block"]');
    if (blocks.length !== 2) throw new Error(`expected 2 Blocks (hug + control); found ${blocks.length}`);
    const [hugBlock, fullBlock] = blocks;

    const hugHeader = headerOf(hugBlock).getBoundingClientRect();
    const hugBlockRect = hugBlock.getBoundingClientRect();
    if (!(hugHeader.width < hugBlockRect.width)) {
      throw new Error(`hugged header width (${hugHeader.width.toFixed(2)}) is not less than the block's own width (${hugBlockRect.width.toFixed(2)})`);
    }

    // The tab does not change where the body starts: both bodies' own top
    // edge lands at the same y, even though the hug header is narrower.
    const hugBodyTop = bodyOf(hugBlock).getBoundingClientRect().top;
    const fullBodyTop = bodyOf(fullBlock).getBoundingClientRect().top;
    expectWithin(hugBodyTop, fullBodyTop, fullBodyTop, TOLERANCE_PX, "hug block's body top vs the full-header control's");
  },
};

/* ------------------------------------------------------------------ */
/* 4 · HeadTabNoFooter — headerFit="hug", no footer.                     */
/* ------------------------------------------------------------------ */

export const HeadTabNoFooter: Story = {
  render: () => <Block header="Planner" body="Body" headerFit="hug" width={260} height={160} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Planner");

    const header = headerOf(canvasElement);
    const block = blockOf(canvasElement);
    const headerRect = header.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();

    await expect(canvasElement.querySelector('[data-slot="block-footer"]')).toBeNull();
    if (!(headerRect.width < blockRect.width)) {
      throw new Error(`hugged header width (${headerRect.width.toFixed(2)}) is not less than the block's own width (${blockRect.width.toFixed(2)})`);
    }
  },
};

/* ------------------------------------------------------------------ */
/* 5 · HeadTabWithPorts — one port on the tab's left edge, one on its    */
/* RIGHT edge. The load-bearing story: the right dot must ride the       */
/* TAB's own right edge, strictly inside the block's.                    */
/* ------------------------------------------------------------------ */

const TAB_LEFT_PORT: PortEdgeItem[] = [{ id: "tab-in", label: "in", state: "wired" }];
const TAB_RIGHT_PORT: PortEdgeItem[] = [{ id: "tab-out", label: "out", state: "empty" }];

function HeadTabWithPortsDemo() {
  return (
    <BlockPort
      id="head-tab-with-ports"
      view="port"
      edges={{
        left: { items: TAB_LEFT_PORT, band: "header" },
        right: { items: TAB_RIGHT_PORT, band: "header" },
      }}
    >
      <Block header="Planner" body="Body" footer="ready" headerFit="hug" width={280} height={180} />
    </BlockPort>
  );
}

export const HeadTabWithPorts: Story = {
  render: () => <HeadTabWithPortsDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Planner");

    const wrapper = required<HTMLElement>(canvasElement, '[data-slot="block-port"]', "the BlockPort wrapper");
    const header = headerOf(wrapper);
    const block = blockOf(wrapper);
    const headerRect = header.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();

    // The whole feature: the tab is narrower than the block.
    if (!(headerRect.width < blockRect.width)) {
      throw new Error(`tab width (${headerRect.width.toFixed(2)}) is not strictly less than the block's own width (${blockRect.width.toFixed(2)})`);
    }

    const left = dotCentre(wrapper, "left", "tab-in");
    expectWithin(left.x, blockRect.left, blockRect.left, TOLERANCE_PX, "left dot x (block's own left edge)");

    const right = dotCentre(wrapper, "right", "tab-out");
    expectWithin(right.x, headerRect.right, headerRect.right, TOLERANCE_PX, "right dot x (the TAB's right edge)");
    // Assert the INEQUALITY, not just the near-equality above: a rail
    // planted on the block's own right edge instead of the tab's would
    // still be "close to" a wrong number if the tolerance were loose, but
    // it can never be strictly less than the block's right edge.
    if (!(right.x < blockRect.right - TOLERANCE_PX)) {
      throw new Error(`right dot x (${right.x.toFixed(2)}) is not strictly less than the block's right edge (${blockRect.right.toFixed(2)}) — it rode the block's own wall, not the tab's`);
    }
  },
};

/* ------------------------------------------------------------------ */
/* 6 · BareHeader — headerFit="hug", showHeaderDivider={false}: a         */
/* chevron + title, one port on the left, NO tab outline at all.         */
/* ------------------------------------------------------------------ */

const BARE_LEFT_PORT: PortEdgeItem[] = [{ id: "bare-in", label: "in", state: "empty" }];

function BareHeaderDemo() {
  return (
    <BlockPort id="bare-header" view="port" edges={{ left: { items: BARE_LEFT_PORT, band: "header" } }}>
      <Block
        header={
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <FoldingChevron open onClick={() => {}} />
            <span>Planner</span>
          </div>
        }
        body="Body"
        headerFit="hug"
        showHeaderDivider={false}
        width={280}
        height={160}
      />
    </BlockPort>
  );
}

export const BareHeader: Story = {
  render: () => <BareHeaderDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Planner");

    const wrapper = required<HTMLElement>(canvasElement, '[data-slot="block-port"]', "the BlockPort wrapper");
    const header = headerOf(wrapper);
    const style = getComputedStyle(header);

    await expect(style.borderBottomWidth).toBe("0px");
    await expect(style.borderRightWidth).toBe("0px");

    // The port dot is still on the header band even with no outline drawn.
    const headerRect = header.getBoundingClientRect();
    const { y } = dotCentre(wrapper, "left", "bare-in");
    expectWithin(y, headerRect.top, headerRect.bottom, TOLERANCE_PX, "left dot y");
  },
};
