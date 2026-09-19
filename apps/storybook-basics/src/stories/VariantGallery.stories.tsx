/**
 * Control Flow/Variant Gallery — the cf-F gallery board (a branch inside a loop, a
 * bypass around both, a `mut` cable) under whichever PORT style and REGION
 * drawing the Storybook toolbar has picked.
 *
 * Zach's standing rule (2026-09-09): a prototype is never gated behind a URL
 * flag. In the app that is the bottom-right pill
 * (`apps/systemsketch/src/chrome/variantSwitch.tsx`); here it is two toolbar
 * globals, `portVariant` and `regionVariant` (`.storybook/preview.tsx`),
 * stamping the SAME two `<html>` attributes the app's pill stamps. So one
 * board shows all 5 × 5 combinations, and the board is the real one.
 *
 * WHY the board is IMPORTED from `ControlFlowGallery.stories` rather than
 * rebuilt: that file's own header — "a retyped copy is exactly how a gallery
 * starts drawing its own private truth". Its `BranchInLoop` render is reused
 * verbatim; this file adds only the measurements that prove the globals
 * reach the paint. (Importing a CSF file does not re-run its stories as
 * tests here: addon-vitest wraps each file's test block in "is this the
 * file being run", measured in `storybook/internal/csf-tools`'s
 * `vitestTransform`.)
 *
 * The two `Pinned…` stories are TEST-ONLY (`!dev`: absent from the sidebar,
 * still run by `pnpm test-stories`). They pin the globals the way a toolbar
 * click would, and measure what the decorator must make true — the
 * attributes on `<html>`, the dot's box, the arm header's height, the ruled
 * header — so the toolbar is graded, not just rendered.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { PORT_VARIANTS, type PortVariantId } from "../skin/portVariants";
import { REGION_VARIANTS, type RegionVariantId } from "../skin/regionVariants";
import { BranchInLoop } from "./ControlFlowGallery.stories";

const meta = {
  title: "Control Flow/Variant Gallery",
  tags: ["area:control-flow", "lane:prf-app-variant-switch-2026-09-19"],
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

/** The branch's OWN frame — `br` sits inside the loop, so a descendant
 *  selector from the loop would find both. */
function branchFrame(root: ParentNode): HTMLElement {
  return required<HTMLElement>(root, '[data-region-id="br"][data-slot="region-frame"]', "the branch's frame");
}

/**
 * What the pair of globals must make true on this board, measured:
 *   • both `<html>` attributes — `v1` is the ABSENT attribute, the same
 *     convention `setRegionVariant` writes and both readers resolve;
 *   • a plain member's dot (`merge().pose`) at the port variant's box;
 *   • the branch's two arm headers at the region variant's height;
 *   • the header rule drawn exactly when the region variant is `ruled`,
 *     spanning the frame.
 */
async function expectBoardIn(root: HTMLElement, port: PortVariantId, region: RegionVariantId) {
  await waitFor(() => {
    expect(document.documentElement.dataset.bboxPortVariant ?? "v1").toBe(port);
    expect(document.documentElement.dataset.bboxRegionVariant ?? "v1").toBe(region);
  });

  await waitFor(() => {
    const dot = required<HTMLElement>(root, '[data-block-id="merge"] [data-port-id="pose"] [data-slot="port-dot"]', "merge's pose dot");
    expect(dot.getBoundingClientRect().width, `merge().pose's dot under ${port}`).toBeCloseTo(PORT_VARIANTS[port].dot.diameter, 0);
  });

  await waitFor(() => {
    const frame = branchFrame(root);
    const headers = Array.from(frame.querySelectorAll<HTMLElement>(':scope > [data-slot="region-arm"] > [data-slot="region-arm-header"]'));
    expect(headers, "the branch's two arm headers").toHaveLength(2);
    for (const header of headers) {
      expect(Math.abs(header.getBoundingClientRect().height - REGION_VARIANTS[region].arms.headerPx), `arm header under ${region}`).toBeLessThanOrEqual(0.5);
    }
  });

  const frame = branchFrame(root);
  const rule = required<HTMLElement>(frame, ':scope > [data-slot="region-header-rule"]', "the branch's header rule");
  if (REGION_VARIANTS[region].corner.integration === "ruled") {
    await waitFor(() => expect(getComputedStyle(rule).display).not.toBe("none"));
    const ruleRect = rule.getBoundingClientRect();
    expect(ruleRect.height).toBeGreaterThanOrEqual(0.5);
    expect(Math.abs(ruleRect.width - frame.clientWidth), "the rule spans the branch's frame").toBeLessThanOrEqual(1);
  } else {
    await waitFor(() => expect(getComputedStyle(rule).display).toBe("none"));
  }
}

/** The one story Zach uses: the gallery board, switched from the toolbar. */
export const VariantGallery: Story = {
  name: "VariantGallery",
  render: (args, context) => BranchInLoop.render!(args, context),
  play: async ({ canvasElement, globals }) => {
    // Whatever the toolbar says — under `pnpm test-stories` that is the
    // initial `v1`/`v1`.
    const port = (globals.portVariant as PortVariantId | undefined) ?? "v1";
    const region = (globals.regionVariant as RegionVariantId | undefined) ?? "v1";
    await expectBoardIn(canvasElement, port, region);
  },
};

export const PinnedPortV3RegionV2: Story = {
  name: "pinned: ports v3 (Langflow) · regions v2 (Ruled)",
  tags: ["!dev"],
  globals: { portVariant: "v3", regionVariant: "v2" },
  render: (args, context) => BranchInLoop.render!(args, context),
  play: async ({ canvasElement }) => {
    await expectBoardIn(canvasElement, "v3", "v2");
  },
};

export const PinnedPortV5RegionV4: Story = {
  name: "pinned: ports v5 (Reticle) · regions v4 (Bracket)",
  tags: ["!dev"],
  globals: { portVariant: "v5", regionVariant: "v4" },
  render: (args, context) => BranchInLoop.render!(args, context),
  play: async ({ canvasElement }) => {
    await expectBoardIn(canvasElement, "v5", "v4");
    // The bracket opens right and bottom — the paint followed the global,
    // not just the header height.
    const frame = branchFrame(canvasElement);
    expect(getComputedStyle(frame).borderRightWidth).toBe("0px");
    expect(getComputedStyle(frame).borderBottomWidth).toBe("0px");
  },
};
