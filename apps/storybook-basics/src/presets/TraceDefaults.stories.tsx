/**
 * Control Flow/Trace Defaults — the four rendering rules Zach set on
 * 2026-09-22, measured on the exact board he reported them on (Control
 * Flow › Branch › "One input (if fast: / else:)", `BRANCH_ONE_INPUT`):
 *
 *   1. "by default can you please update the data traces to draw without an
 *      arrow? because its DAG, we already know the order!"
 *   2. "Please also make the trace end exactly at the port … right now there
 *      is this spacing which is not desirable!"
 *   3. "Please also lets do ports v2 as the default ones … and for regions
 *      make v9 the default one"
 *   4. "Please enforce a minimum height on the blocks … that can be
 *      calculated from the minimum port spacing. You should never have a
 *      rendering issue like this" — `src`'s third port hanging below it.
 *
 * Every assertion MEASURES (`getBoundingClientRect`, `getComputedStyle`, the
 * mounted path's own geometry). The ring a trace must touch is read off the
 * dot's COMPUTED `box-shadow` — the pixels actually painted — not off
 * `portDotRingRadiusPx`, the function the wire layer used to place the end:
 * a test that asked the implementation where the ring is would agree with
 * any bug in it.
 *
 * No `globals` on this story, on purpose: rule 3 is a claim about what a
 * FRESH Storybook opens on (`.storybook/preview.tsx`'s `initialGlobals`).
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { Block } from "../components/block";
import { BlockPort } from "../components/blockPort";
import { DomCanvas } from "../hosts/domCanvas";
import { BRANCH_ONE_INPUT } from "./branch/branch.fixtures";
import { expectWirePainted } from "./controlFlow.acceptance";

const meta = {
  title: "Control Flow/Trace Defaults",
  tags: ["area:control-flow", "lane:trace-defaults"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const WIRES = ["e-cond", "e-frame1", "e-frame2", "e-gain", "e-out1", "e-out2"];
/**
 * Zach's "touch": the visible ink ends within this many px of the ring.
 *
 * WHY 0.5 and not 1: 1px let the app's own OLD pull-back pass (a fixed 8px
 * against a v2 ring of 6 + a 1px cap = exactly 1.00px of daylight — the
 * 2026-09-22 audit's finding). Measured noise on the new ends is 0.00-0.13px
 * (subpixel dot centres), so 0.5 separates "touching" from "one pixel short"
 * with room to spare.
 */
const TOUCH_TOLERANCE_PX = 0.5;

interface Dot {
  el: HTMLElement;
  cx: number;
  cy: number;
  /** Painted outer radius: the box plus the largest box-shadow spread. */
  ring: number;
}

/** The largest `box-shadow` spread on the dot — its outermost painted ring. */
function outerSpreadPx(el: Element): number {
  const shadow = getComputedStyle(el).boxShadow;
  if (!shadow || shadow === "none") return 0;
  let max = 0;
  for (const match of shadow.matchAll(/(-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px/g)) {
    max = Math.max(max, Number(match[4]));
  }
  return max;
}

function dotOf(root: ParentNode, blockId: string, portId: string): Dot {
  const block = root.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
  if (!block) throw new Error(`no block \`${blockId}\``);
  const item = Array.from(block.querySelectorAll<HTMLElement>(`[data-port-id="${portId}"]`)).find(
    (candidate) => candidate.closest("[data-block-id]") === block,
  );
  const el = item?.querySelector<HTMLElement>('[data-slot="port-dot"]');
  if (!el) throw new Error(`no dot for \`${blockId}/${portId}\``);
  const rect = el.getBoundingClientRect();
  return { el, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, ring: rect.width / 2 + outerSpreadPx(el) };
}

/** Both ends of a wire's painted line, in client px, plus its cap reach. */
function paintedEnds(root: ParentNode, wireId: string): { start: DOMPoint; end: DOMPoint; capPx: number } {
  const line = root.querySelector<SVGPathElement>(`[data-wire-id="${wireId}"] [data-slot="trace-line"]`);
  if (!line) throw new Error(`no trace line for \`${wireId}\``);
  const ctm = line.getScreenCTM()!;
  const total = line.getTotalLength();
  const at = (length: number) => {
    const p = line.getPointAtLength(length);
    return new DOMPoint(p.x, p.y).matrixTransform(ctm);
  };
  const style = getComputedStyle(line);
  // A round cap paints half the stroke width PAST the path's last point.
  const capPx = style.strokeLinecap === "round" ? Number.parseFloat(style.strokeWidth) / 2 : 0;
  return { start: at(0), end: at(total), capPx };
}

/** How far the visible ink stops short of (+) or runs into (−) the ring. */
function inkGapPx(point: DOMPoint, capPx: number, dot: Dot): number {
  return Math.hypot(point.x - dot.cx, point.y - dot.cy) - capPx - dot.ring;
}

const ENDS: Record<string, [[string, string], [string, string]]> = {
  "e-cond": [["src", "fast"], ["br", "fast"]],
  "e-frame1": [["src", "frame"], ["estimate", "frame"]],
  "e-frame2": [["src", "frame"], ["fallback", "frame"]],
  "e-gain": [["src", "gain"], ["estimate", "gain"]],
  "e-out1": [["estimate", "Pose"], ["encode", "pose"]],
  "e-out2": [["fallback", "Pose"], ["encode", "pose"]],
};

export const BranchOneInput: Story = {
  name: "Branch one input — no arrows, ends touch, v2/v9, src fits",
  render: () => <DomCanvas scene={BRANCH_ONE_INPUT} width={1040} height={560} />,
  play: async ({ canvasElement }) => {
    for (const wireId of WIRES) await expectWirePainted(canvasElement, wireId);

    // 3 · The defaults a fresh Storybook opens on. Stamped on <html> by the
    // toolbar decorator, and actually painted: every dot and the region
    // report the variant they resolved to.
    expect(document.documentElement.getAttribute("data-bbox-port-variant")).toBe("v2");
    expect(document.documentElement.getAttribute("data-bbox-region-variant")).toBe("v9");
    const dots = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-slot="port-dot"]'));
    expect(dots.length).toBeGreaterThan(0);
    for (const dot of dots) expect(dot.getAttribute("data-bbox-port-variant")).toBe("v2");
    expect(canvasElement.querySelector('[data-region-id="br"]')?.getAttribute("data-region-variant")).toBe("v9");

    // 1 · No arrowhead unless a caller asks: no marker element, and no line
    // pointing at one.
    const layer = canvasElement.querySelector('[data-slot="wire-layer"]')!;
    expect(layer.querySelectorAll("marker")).toHaveLength(0);
    for (const line of layer.querySelectorAll('[data-slot="trace-line"]')) {
      expect(line.getAttribute("marker-end"), "a default trace carries no marker-end").toBeNull();
    }

    // 2 · Every trace end touches its dot's painted ring, both ends. Waited
    // for, because the layer settles one frame after the rails land.
    await waitFor(() => {
      for (const wireId of WIRES) {
        const { start, end, capPx } = paintedEnds(canvasElement, wireId);
        const [[fromBlock, fromPort], [toBlock, toPort]] = ENDS[wireId];
        const fromGap = inkGapPx(start, capPx, dotOf(canvasElement, fromBlock, fromPort));
        const toGap = inkGapPx(end, capPx, dotOf(canvasElement, toBlock, toPort));
        expect(Math.abs(fromGap), `${wireId} leaves ${fromBlock}/${fromPort} ${fromGap.toFixed(2)}px off the ring`).toBeLessThanOrEqual(TOUCH_TOLERANCE_PX);
        expect(Math.abs(toGap), `${wireId} lands on ${toBlock}/${toPort} ${toGap.toFixed(2)}px off the ring`).toBeLessThanOrEqual(TOUCH_TOLERANCE_PX);
      }
    });

    // The fan-in count still paints on its dot, and no trace runs across it.
    // Measured by walking every wire's painted path (inflated by half its
    // stroke) against the badge's box — `elementFromPoint` cannot answer
    // this, because the badge is `pointer-events: none` and hit-testing
    // skips it.
    const badge = canvasElement.querySelector<HTMLElement>('[data-block-id="encode"] [data-slot="port-producers"]');
    expect(badge, "encode.pose has two producers, so it paints a count").not.toBeNull();
    expect(badge!.textContent?.trim()).toBe("2");
    const box = badge!.getBoundingClientRect();
    expect(box.width).toBeGreaterThan(0);
    for (const wireId of WIRES) {
      const line = canvasElement.querySelector<SVGPathElement>(`[data-wire-id="${wireId}"] [data-slot="trace-line"]`)!;
      const ctm = line.getScreenCTM()!;
      const half = Number.parseFloat(getComputedStyle(line).strokeWidth) / 2;
      for (let s = 0; s <= line.getTotalLength(); s += 1) {
        const p = new DOMPoint(line.getPointAtLength(s).x, line.getPointAtLength(s).y).matrixTransform(ctm);
        const inside = p.x > box.left - half && p.x < box.right + half && p.y > box.top - half && p.y < box.bottom + half;
        expect(inside, `${wireId} crosses the producers count at (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).toBe(false);
      }
    }

    // 2b · A LIVE port-style switch moves every end onto the NEW ring. v3's
    // ring is 10/2 + 0 + 3 = 8px against v2's 6, so an end left on the old
    // pull-back sits 2px INSIDE the new ring and fails the ±0.5px touch.
    // Set on <html> directly: that attribute IS what the toolbar global
    // stamps (`.storybook/preview.tsx`), and the story restores it after.
    const html = document.documentElement.dataset;
    const before = html.bboxPortVariant;
    html.bboxPortVariant = "v3";
    try {
      await waitFor(() => {
        expect(dotOf(canvasElement, "src", "fast").el.getAttribute("data-bbox-port-variant")).toBe("v3");
        for (const wireId of WIRES) {
          const { start, end, capPx } = paintedEnds(canvasElement, wireId);
          const [[fromBlock, fromPort], [toBlock, toPort]] = ENDS[wireId];
          const fromGap = inkGapPx(start, capPx, dotOf(canvasElement, fromBlock, fromPort));
          const toGap = inkGapPx(end, capPx, dotOf(canvasElement, toBlock, toPort));
          expect(Math.abs(fromGap), `after v3: ${wireId} leaves ${fromBlock}/${fromPort} ${fromGap.toFixed(2)}px off the NEW ring`).toBeLessThanOrEqual(TOUCH_TOLERANCE_PX);
          expect(Math.abs(toGap), `after v3: ${wireId} lands on ${toBlock}/${toPort} ${toGap.toFixed(2)}px off the NEW ring`).toBeLessThanOrEqual(TOUCH_TOLERANCE_PX);
        }
      });
    } finally {
      if (before === undefined) delete html.bboxPortVariant;
      else html.bboxPortVariant = before;
    }

    // 4 · `src` is authored 116px tall with three right-wall ports; its box
    // must reach at least as low as its last dot's painted ring.
    const srcBlock = canvasElement.querySelector<HTMLElement>('[data-block-id="src"] [data-slot="block"]')!;
    const gain = dotOf(canvasElement, "src", "gain");
    await waitFor(() => {
      expect(srcBlock.getBoundingClientRect().bottom).toBeGreaterThanOrEqual(gain.el.getBoundingClientRect().bottom);
      expect(srcBlock.getBoundingClientRect().height, "clamped UP from the stored 116").toBeGreaterThan(116);
    });
  },
};

/**
 * The floor only ever RAISES a box: a caller's own larger `minHeight` wins
 * over the port floor (2026-09-22 audit, LOW — `style={{ minHeight: 300 }}`
 * used to come out 146px). Three right-wall ports, a floor well under 300.
 */
export const CallerMinHeightSurvives: Story = {
  name: "A caller's larger min-height survives the port floor",
  render: () => (
    <div style={{ padding: 32 }}>
      <BlockPort
        id="tall"
        view="port"
        edges={{ right: { items: ["a", "b", "c"].map((id) => ({ id, label: id })) } }}
      >
        <Block header="tall" width={160} height={60} style={{ minHeight: 300 }} />
      </BlockPort>
      <BlockPort
        id="short"
        view="port"
        edges={{ right: { items: ["a", "b", "c"].map((id) => ({ id, label: id })) } }}
      >
        <Block header="short" width={160} height={60} style={{ minHeight: 40 }} />
      </BlockPort>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const boxOf = (id: string) => canvasElement.querySelector<HTMLElement>(`[data-block-id="${id}"] [data-slot="block"]`)!;
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(6));
    await waitFor(() => {
      // 300 wins over the floor (3·24 + 2·18 + header ≈ 145).
      expect(boxOf("tall").getBoundingClientRect().height).toBeCloseTo(300, 0);
      // 40 loses to it: the box is floored above both 40 and the typed 60,
      // and every dot is inside.
      const short = boxOf("short").getBoundingClientRect();
      expect(short.height).toBeGreaterThan(60);
      for (const dot of canvasElement.querySelectorAll('[data-block-id="short"] [data-slot="port-dot"]')) {
        expect(dot.getBoundingClientRect().bottom).toBeLessThanOrEqual(short.bottom + 0.5);
      }
    });
  },
};
