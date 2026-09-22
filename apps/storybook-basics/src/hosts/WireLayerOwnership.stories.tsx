import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { DomCanvas } from "./domCanvas";
import type { HostScene } from "./hostScene";

/**
 * Blocks/Host Fixes/Wire Layer Ownership — regression for
 * `WireLayer.resolveDot`'s member-ownership bug (host-fixes lane, defect 2).
 *
 * `proc` is an expanded Block with its own `in` port; `kid` is a MEMBER of
 * `proc` that happens to also declare a port named `in` — both legal on
 * their own (`ports` is per-node, a member's own port list is unrelated to
 * its parent's), and both dots land inside `[data-block-id="proc"]`'s
 * subtree once rendered (a member's markup nests inside its parent's).
 * `resolveDot` used to take `block.querySelector('[data-port-id="in"]')`'s
 * FIRST match with no ownership check, which resolved to whichever of the
 * two dots happens to come first in document order — `kid`'s, measured —
 * for an edge that names `proc/in`. Silently wrong, not unresolved: the
 * layer's own `data-unresolved-wires` read `""` throughout.
 */

const ownershipScene: HostScene = {
  nodes: [
    {
      id: "proc",
      type: "block",
      position: { x: 20, y: 20 },
      data: { name: "proc", view: "expanded", w: 240, h: 180, ports: { left: ["in"] }, anchorStart: ["left"] },
    },
    // The member that reuses `proc`'s own port name — the exact shape that
    // exposed the bug. Rendered INSIDE proc (`blockPort.tsx:321` stamps
    // `data-block-id` on every Block, member or not), so both `in` dots
    // share the same `[data-block-id="proc"]` ancestor subtree.
    { id: "kid", type: "block", parentId: "proc", position: { x: 0, y: 0 }, data: { name: "kid", view: "port", w: 100, h: 60, ports: { left: ["in"] } } },
    { id: "gain", type: "value", position: { x: 300, y: 130 }, data: { name: "gain", value: "0.75", writers: [], readers: ["val"] } },
  ],
  edges: [
    // The exact wire the lane brief names: gain's `val` into proc's own
    // `in` — both top-level, port-bearing endpoints (legal per
    // `hostScene.ts`'s "every edge connects top-level nodes" rule); the
    // ambiguity is entirely inside `proc`'s own subtree, not about routing
    // into a member.
    { id: "e-in", source: "gain", sourceHandle: "val", target: "proc", targetHandle: "in" },
  ],
};

const meta = {
  title: "Hosts/WireLayer Ownership",
  tags: ["object:trace", "host:dom", "lane:host-fixes"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`expected ${what} (\`${selector}\`) in the rendered host`);
  return el;
}

function centre(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export const OwnDotOverMemberDot: Story = {
  name: "proc/in resolves to proc's own dot, not kid's",
  render: () => <DomCanvas scene={ownershipScene} width={480} height={260} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="dom-canvas"]', "the DOM Canvas host");

    const layer = await waitFor(() => required<SVGSVGElement>(host, '[data-slot="wire-layer"]', "the wire layer"));
    const path = await waitFor(() => required<SVGPathElement>(host, '[data-wire-id="e-in"] [data-slot="trace-line"]:not([data-sketch="true"])', "e-in's rendered path"));

    // The existing "did it render at all" check every host story already
    // makes — passes both before and after the fix, which is exactly why
    // it never caught this: a silently-wrong resolution still renders.
    expect(layer.getAttribute("data-unresolved-wires")).toBe("");

    // The ownership check the bug skipped: proc's OWN `in` dot is the one
    // whose nearest `[data-block-id]` ancestor IS proc, not kid's nested
    // one — the same rule `reactFlowHost.tsx`'s `dotOwnedBy` already
    // applies.
    const procBlock = required<HTMLElement>(host, '[data-block-id="proc"]', "proc's block root");
    const kidBlock = required<HTMLElement>(host, '[data-block-id="kid"]', "kid's block root");
    const procOwnDot = Array.from(procBlock.querySelectorAll<HTMLElement>('[data-port-id="in"]')).find(
      (candidate) => candidate.closest("[data-block-id]") === procBlock,
    );
    const kidDot = kidBlock.querySelector<HTMLElement>('[data-port-id="in"]');
    if (!procOwnDot) throw new Error("proc has no own `in` dot distinct from kid's");
    if (!kidDot) throw new Error("kid has no `in` dot");
    expect(procOwnDot).not.toBe(kidDot);

    // The wire's actual rendered end point — read off the path geometry
    // itself, the same "measured, not asserted" rule `DragPolicy.stories`
    // follows — must land at proc's own dot, not kid's. `WireLayer` settles
    // in more than one pass (its own `attach`: an immediate measure, a
    // deferred rAF pass, then a steady-state `ResizeObserver` — the file's
    // own "two F1-class races" comment), so `waitFor` rather than a single
    // read: the first commit's geometry is not necessarily the final one.
    // The wire's actual rendered end point — read off the geometry of the
    // real routed line (`data-slot="trace-line"`, excluding the sketch
    // overlay and the arrowhead marker's own tiny internal `<path>`, both
    // of which also match a bare `path` selector), the same "measured, not
    // asserted" rule `DragPolicy.stories` follows — must land near proc's
    // own dot, not kid's. `WireLayer` settles in more than one pass (its
    // own `attach`: an immediate measure, a deferred rAF pass, then a
    // steady-state `ResizeObserver` — the file's own "two F1-class races"
    // comment), so `waitFor` rather than a single read.
    //
    // The route stops ~16px short of the dot's exact centre on purpose (a
    // lead-in/lead-out stub along the port's own normal, measured
    // symmetrically on both ends here) — so "close" is a margin comfortably
    // under that stub, not the dot's centre itself. The real bug-detecting
    // assertion is the RELATIVE one: closer to the correct dot than the
    // wrong one, by an unmistakable margin (measured 16px vs 63px here).
    const svgRect = layer.getBoundingClientRect();
    await waitFor(
      () => {
        const freshPath = required<SVGPathElement>(
          host,
          '[data-wire-id="e-in"] [data-slot="trace-line"]:not([data-sketch="true"])',
          "e-in's rendered line",
        );
        const end = freshPath.getPointAtLength(freshPath.getTotalLength());
        const endScreen = { x: svgRect.left + end.x, y: svgRect.top + end.y };
        const toProc = dist(endScreen, centre(procOwnDot));
        const toKid = dist(endScreen, centre(kidDot));
        expect(toProc).toBeLessThan(toKid);
        expect(toProc).toBeLessThan(25);
      },
      { timeout: 3000 },
    );
  },
};
