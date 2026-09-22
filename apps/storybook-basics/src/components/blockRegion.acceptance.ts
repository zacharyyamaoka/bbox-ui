// src/components/blockRegion.acceptance.ts — the STORY-LEVEL acceptance
// assertions for docs/CONTROL-FLOW-PLAN.md, committed before any builder
// existed and OFF-LIMITS to builders. A lane's stories import these and
// call them from `play`; the assertions define "done" for what Zach will
// look at, and they are MEASURED (`getBoundingClientRect`, sampled SVG
// paths), never DOM-presence-only. Not a `*.stories.tsx` (the Storybook
// glob) and not a `*.test.ts` (the unit project) — a helper module that
// compiles today against nothing new.
//
// The DOM contract every helper reads (lane A stamps it; see the plan):
//   [data-slot="region"][data-region-id][data-region-kind][data-region-view]
//     [data-slot="region-frame"]                    expanded only
//       [data-slot="region-corner"] > [data-block-id=<region id>]   the real Block
//       [data-slot="region-body"]                   free-layout members
//       [data-slot="region-arm"][data-arm-id][data-open][data-active]
//         [data-slot="region-arm-header"] [data-slot="folding-chevron"]
//         [data-slot="region-arm-body"]
//     opaque: the root wraps ONLY the card [data-block-id=<region id>], whose
//       footer carries [data-slot="region-hidden"]
//   WireLayer (lane D): [data-slot="wire-layer"] g[data-wire-id] path, and
//     [data-slot="wire-badges"] [data-wire-id] [data-slot="trace-badge"]
//
// WHY the region ROOT carries `data-region-id` and NEVER `data-block-id`:
// `wireLayer.tsx`'s `resolveDot` takes the FIRST `[data-block-id="<id>"]`
// in document order (wireLayer.tsx:81) — if the frame carried the id, every
// wire into the corner block would resolve against the frame and find no
// dot. The corner card owns the id; the frame owns the region id.

import { expect, waitFor } from "storybook/test";

const TOLERANCE_PX = 2;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function regionRoot(root: ParentNode, regionId: string): HTMLElement {
  return required<HTMLElement>(root, `[data-slot="region"][data-region-id="${regionId}"]`, `region \`${regionId}\``);
}

/**
 * P1, expanded: a frame with a REAL Block integral to its top-left corner,
 * and no value ports of its own. Measured:
 *   - the corner card's top-left coincides with the frame's top-left (≤2px);
 *   - the corner card's non-shared corners are square (it reads as PART of
 *     the frame, the Labeled Group Node look, not a card floating inside);
 *   - every port dot under the region belongs to the corner card or to a
 *     member block — the frame itself owns none.
 */
export async function expectRegionExpanded(root: ParentNode, regionId: string): Promise<void> {
  const region = regionRoot(root, regionId);
  await waitFor(() => {
    expect(region.getAttribute("data-region-view")).toBe("expanded");
    required(region, '[data-slot="region-frame"]', "the frame");
    required(region, `[data-slot="region-corner"] [data-block-id="${regionId}"]`, "the corner block");
  });
  const frame = required<HTMLElement>(region, '[data-slot="region-frame"]', "the frame");
  const corner = required<HTMLElement>(region, `[data-slot="region-corner"] [data-block-id="${regionId}"]`, "the corner block");
  const frameRect = frame.getBoundingClientRect();
  const cornerRect = corner.getBoundingClientRect();
  expect(Math.abs(cornerRect.left - frameRect.left)).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(Math.abs(cornerRect.top - frameRect.top)).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(cornerRect.width).toBeLessThan(frameRect.width);
  expect(cornerRect.height).toBeLessThan(frameRect.height);

  const card = required<HTMLElement>(corner, '[data-slot="block"]', "the corner block's card");
  const style = getComputedStyle(card);
  expect(style.borderTopRightRadius).toBe("0px");
  expect(style.borderBottomLeftRadius).toBe("0px");

  for (const dot of Array.from(region.querySelectorAll<HTMLElement>("[data-port-id]"))) {
    const owner = dot.closest<HTMLElement>("[data-block-id]");
    expect(owner, "a port dot on the frame itself").not.toBeNull();
    const ownerId = owner!.getAttribute("data-block-id");
    if (ownerId === regionId) {
      expect(owner!.closest('[data-slot="region-corner"]'), "the region's own dots live on the corner block").not.toBeNull();
    }
  }
}

/**
 * P5, opaque: a single card — no frame, no arms rendered — whose footer
 * states what it hides in measured words.
 */
export async function expectRegionOpaque(root: ParentNode, regionId: string): Promise<void> {
  const region = regionRoot(root, regionId);
  await waitFor(() => {
    expect(region.getAttribute("data-region-view")).toBe("opaque");
    required(region, `[data-block-id="${regionId}"]`, "the card");
  });
  expect(region.querySelector('[data-slot="region-frame"]')).toBeNull();
  expect(region.querySelector('[data-slot="region-arm"]')).toBeNull();
  const footer = required<HTMLElement>(region, '[data-slot="region-hidden"]', "the what-is-hidden footer");
  const text = footer.textContent?.trim() ?? "";
  expect(text).toMatch(/hidden$/);
  expect(text).toMatch(/^(nothing|\d+ (block|arm|edge)s?)/);
}

/** The corner block carries exactly these ports, by wall — a loop's typed,
 *  unnamed header (`Iterable` / `Iter`; `Bool`), a branch's condition(s). */
export function expectCornerPorts(root: ParentNode, regionId: string, walls: Partial<Record<"left" | "right" | "top" | "bottom", string[]>>): void {
  const corner = required<HTMLElement>(regionRoot(root, regionId), `[data-slot="region-corner"] [data-block-id="${regionId}"]`, "the corner block");
  for (const [wall, ids] of Object.entries(walls)) {
    const rail = required<HTMLElement>(corner, `[data-slot="block-port-rail"][data-edge="${wall}"]`, `the ${wall} rail`);
    const seen = Array.from(rail.querySelectorAll<HTMLElement>("[data-port-id]")).map((dot) => dot.getAttribute("data-port-id"));
    expect(seen).toEqual(ids);
  }
}

/**
 * Arms are full-width rows stacked under the corner block, in order; a
 * folded arm shows its header and no body. Measured off the rows' boxes.
 */
export async function expectArmsStacked(root: ParentNode, regionId: string, armIds: string[]): Promise<void> {
  const region = regionRoot(root, regionId);
  await waitFor(() => {
    expect(Array.from(region.querySelectorAll('[data-slot="region-arm"]')).map((arm) => arm.getAttribute("data-arm-id"))).toEqual(armIds);
  });
  const frame = required<HTMLElement>(region, '[data-slot="region-frame"]', "the frame").getBoundingClientRect();
  const corner = required<HTMLElement>(region, '[data-slot="region-corner"]', "the corner").getBoundingClientRect();
  let previousBottom = corner.bottom;
  for (const armId of armIds) {
    const arm = required<HTMLElement>(region, `[data-slot="region-arm"][data-arm-id="${armId}"]`, `arm \`${armId}\``);
    const rect = arm.getBoundingClientRect();
    expect(rect.top, `arm ${armId} starts where the previous row ended`).toBeGreaterThanOrEqual(previousBottom - TOLERANCE_PX);
    expect(Math.abs(rect.left - frame.left), `arm ${armId} spans from the frame's left edge`).toBeLessThanOrEqual(TOLERANCE_PX * 2);
    expect(Math.abs(rect.width - frame.width), `arm ${armId} spans the frame's width`).toBeLessThanOrEqual(TOLERANCE_PX * 2);
    required(arm, '[data-slot="region-arm-header"] [data-slot="folding-chevron"]', `arm ${armId}'s fold chevron`);
    const body = arm.querySelector<HTMLElement>('[data-slot="region-arm-body"]');
    if (arm.getAttribute("data-open") === "false") {
      expect(body === null || body.getBoundingClientRect().height <= 1, `folded arm ${armId} shows no body`).toBe(true);
    } else {
      expect(body, `open arm ${armId} has a body`).not.toBeNull();
      expect(body!.getBoundingClientRect().height).toBeGreaterThan(0);
    }
    previousBottom = rect.bottom;
  }
  expect(previousBottom).toBeLessThanOrEqual(frame.bottom + TOLERANCE_PX);
}

/** A member renders INSIDE its arm's body (or a loop's body), never as a
 *  host-level node of its own — the nesting the scene declares is the
 *  nesting the DOM shows. */
export function expectMemberInside(root: ParentNode, containerSelector: string, memberId: string): void {
  required(root, `${containerSelector} [data-block-id="${memberId}"]`, `member \`${memberId}\` inside \`${containerSelector}\``);
  expect(root.querySelector(`[data-scene-node="${memberId}"]`), `member ${memberId} is not a host node`).toBeNull();
}

function sampledPoints(path: SVGPathElement, stepPx = 4): { x: number; y: number }[] {
  const total = path.getTotalLength();
  const out: { x: number; y: number }[] = [];
  const ctm = path.getScreenCTM();
  for (let d = 0; d <= total; d += stepPx) {
    const p = path.getPointAtLength(d);
    if (ctm) {
      const m = new DOMPoint(p.x, p.y).matrixTransform(ctm);
      out.push({ x: m.x, y: m.y });
    } else {
      out.push({ x: p.x, y: p.y });
    }
  }
  return out;
}

/**
 * Bypass (lane D): the wire's painted path never enters the obstacle's
 * box. Sampled every 4px along the REAL rendered path in screen space,
 * compared against the obstacle's real box, inset 1px so a touching
 * edge does not count as entering.
 */
export async function expectWireAvoids(root: ParentNode, wireId: string, obstacleSelector: string): Promise<void> {
  const obstacle = required<HTMLElement>(root, obstacleSelector, `obstacle \`${obstacleSelector}\``);
  await waitFor(() => {
    required(root, `[data-slot="wire-layer"] [data-wire-id="${wireId}"] path`, `wire \`${wireId}\``);
  });
  const path = required<SVGPathElement>(root, `[data-slot="wire-layer"] [data-wire-id="${wireId}"] path`, `wire \`${wireId}\``);
  const box = obstacle.getBoundingClientRect();
  const inside = sampledPoints(path).filter(
    (p) => p.x > box.left + 1 && p.x < box.right - 1 && p.y > box.top + 1 && p.y < box.bottom - 1,
  );
  expect(inside, `wire ${wireId} enters ${obstacleSelector} at ${inside.length} sampled points`).toHaveLength(0);
}

/** A wire resolved and painted (its `data-wire-id` group exists and it is
 *  not listed in the layer's `data-unresolved-wires`). */
export async function expectWirePainted(root: ParentNode, wireId: string): Promise<void> {
  await waitFor(() => {
    required(root, `[data-slot="wire-layer"] [data-wire-id="${wireId}"] path`, `wire \`${wireId}\``);
  });
  const layer = required<SVGElement>(root, '[data-slot="wire-layer"]', "the wire layer");
  const unresolved = (layer.getAttribute("data-unresolved-wires") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  expect(unresolved).not.toContain(wireId);
}

/** The z⁻¹ / mut pill rides its wire (lane D): a `TraceBadge` in the
 *  layer's badge sibling, keyed by the wire's id, reading `text`. */
export async function expectWireBadge(root: ParentNode, wireId: string, text: string): Promise<void> {
  await waitFor(() => {
    const badge = required<HTMLElement>(root, `[data-slot="wire-badges"] [data-wire-id="${wireId}"] [data-slot="trace-badge"]`, `badge on wire \`${wireId}\``);
    expect(badge.textContent?.trim()).toBe(text);
  });
}

/** A control-exit mark (B5) is a badge on the block, and no wire leaves it. */
export function expectControlMark(root: ParentNode, blockId: string, mark: "break" | "continue" | "pass"): void {
  const block = required<HTMLElement>(root, `[data-block-id="${blockId}"]`, `block \`${blockId}\``);
  required(block, `[data-slot="control-mark"][data-mark="${mark}"]`, `the ${mark} mark`);
  const wires = Array.from(root.querySelectorAll<SVGGElement>('[data-slot="wire-layer"] [data-wire-id]'));
  for (const wire of wires) {
    expect(wire.getAttribute("data-wire-from"), `no wire may originate at a ${mark} mark`).not.toBe(`${blockId}/${mark}`);
  }
}
