import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";
import { ReactFlow, ReactFlowProvider, type NodeTypes } from "@xyflow/react";
// WHY imported here, not in `.storybook/preview.css`: the same convention
// `demos/story-hosts/src/ReactFlowHost.tsx` and
// `apps/docs/src/components/create/viewport/reactflow-canvas.tsx` already
// use — the file that mounts `<ReactFlow>` owns pulling in its stylesheet,
// so a story that never renders React Flow never pays for it.
import "@xyflow/react/dist/style.css";

import { BlockNodeReactflow, type BlockNodeReactflowData, type BlockNodeReactflowType } from "./blockNodeReactflow";
import type { BlockNodePort } from "./blockNodeReactflow.layout";

/**
 * Hosts/BlockNodeReactflow — the trunk-based React Flow adapter: a real
 * `BlockPort` (real bbox-ui `Block`, real `PortEdge` rails) rendered as a
 * `<ReactFlow>` custom node, with a real `<Handle>` at every port.
 *
 * Every claim below is MEASURED off `getBoundingClientRect`
 * (`BlockPort.stories.tsx`'s own rule) — a Handle that exists in the DOM
 * but sits 40px off its dot would look identical to a correct one in any
 * DOM-presence assertion, and only measurement tells them apart.
 */

const NODE_TYPES: NodeTypes = { bboxBlock: BlockNodeReactflow };

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

/** The wrapping div's own rendered explicit size stands in for a host's
 *  page — React Flow needs a sized parent to lay its viewport out in. */
function Canvas({ nodes }: { nodes: BlockNodeReactflowType[] }) {
  return (
    <div style={{ width: 640, height: 420 }}>
      <ReactFlowProvider>
        <ReactFlow nodes={nodes} edges={[]} nodeTypes={NODE_TYPES} fitView proOptions={{ hideAttribution: true }} />
      </ReactFlowProvider>
    </div>
  );
}

// WHY no `component`/`args` (the `BlockLayouts.stories.tsx` pattern, not
// `BlockPort.stories.tsx`'s): `BlockNodeReactflow`'s props are React Flow's
// generated `NodeProps<BlockNodeReactflowType>` — a large, mostly
// library-owned shape (`sourcePosition`, `positionAbsoluteX`, …) that no
// story here ever constructs directly; every story renders `<ReactFlow>`
// itself and lets it supply those props. A `component`/`args` pair that
// nothing reads is the exact dead weight `BlockPort.stories.tsx:218`
// tolerates for a controlled component; this component has no such
// precedent to match.
const meta = {
  title: "Hosts/BlockNodeReactflow",
  tags: ["object:block", "host:react-flow", "lane:finish-l-reg"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* ClassicDag — inputs on the left wall (`target`s), outputs on the      */
/* right wall (`source`s) — the same "classic input/output dag" fixture  */
/* `BlockPort.stories.tsx`'s own `ClassicDag` uses, restated as ports.   */
/* ------------------------------------------------------------------ */

const PLANNER_PORTS: BlockNodePort[] = [
  { id: "pose", edge: "left", direction: "input", label: "pose", state: "wired" },
  { id: "gain", edge: "left", direction: "input", label: "gain", state: "valueSet" },
  { id: "reset", edge: "left", direction: "input", label: "reset", state: "empty" },
  { id: "cmd", edge: "right", direction: "output", label: "cmd", state: "wired" },
  { id: "status", edge: "right", direction: "output", label: "status", state: "empty" },
];

const PLANNER_NODE: BlockNodeReactflowType = {
  id: "planner",
  type: "bboxBlock",
  position: { x: 40, y: 40 },
  data: {
    view: "port",
    header: "Planner",
    body: null,
    footer: "ready",
    width: 220,
    height: 240,
    ports: PLANNER_PORTS,
  } satisfies BlockNodeReactflowData,
};

export const ClassicDag: Story = {
  render: () => <Canvas nodes={[PLANNER_NODE]} />,
  play: async ({ canvasElement }) => {
    // WHY `waitFor` (the one change from donor 611d985's play): CLAUDE.md —
    // a play's first query must not be a bare synchronous read, or an
    // unmounted story fails under load and later negative checks go vacuous.
    const wrapper = await waitFor(() =>
      required<HTMLElement>(canvasElement, '[data-slot="block-node-reactflow"]', "the BlockNodeReactflow wrapper"),
    );

    // Every dot `BlockPort` actually painted — one per port, none collapsed
    // in this fixture (five items split 3/2 across two walls, well under a
    // collapse threshold).
    const dots = wrapper.querySelectorAll<HTMLElement>("[data-port-id]");
    await expect(dots).toHaveLength(PLANNER_PORTS.length);
    await expect(wrapper.querySelectorAll('[data-collapsed-ports]')).toHaveLength(0);

    // One real `<Handle>` per port — not a guess at "should be five", the
    // adapter's own count, read back.
    const handles = wrapper.querySelectorAll<HTMLElement>('[data-slot="block-node-reactflow-handle"]');
    await expect(handles).toHaveLength(PLANNER_PORTS.length);

    // Measured off `getBoundingClientRect` (`BlockPort.stories.tsx`'s own
    // rule) — this is checking what the BROWSER painted, on screen, inside
    // React Flow's own zoomed/panned viewport; it is deliberately NOT the
    // same coordinate space `blockNodeReactflow.tsx` computes internally
    // (that file's own module doc explains why a screen-space delta would
    // be the wrong thing to use there). A bug that got the local math right
    // but the screen math wrong, or vice versa, would still be caught here.
    for (const port of PLANNER_PORTS) {
      const dotItem = required<HTMLElement>(wrapper, `[data-port-id="${port.id}"]`, `a rendered dot for port \`${port.id}\``);
      const dot = required<HTMLElement>(dotItem, '[data-slot="port-dot"]', `the Port element inside \`${port.id}\`'s wrapper`);
      const handle = required<HTMLElement>(wrapper, `[data-handleid="${port.id}"]`, `a Handle for port \`${port.id}\``);

      const dotRect = dot.getBoundingClientRect();
      const handleRect = handle.getBoundingClientRect();
      const dotCentre = { x: dotRect.left + dotRect.width / 2, y: dotRect.top + dotRect.height / 2 };
      const handleCentre = { x: handleRect.left + handleRect.width / 2, y: handleRect.top + handleRect.height / 2 };
      const distance = Math.hypot(dotCentre.x - handleCentre.x, dotCentre.y - handleCentre.y);
      if (!(distance <= 1)) {
        throw new Error(
          `port \`${port.id}\` — handle centre (${handleCentre.x.toFixed(2)}, ${handleCentre.y.toFixed(2)}) is ` +
            `${distance.toFixed(2)}px from its dot centre (${dotCentre.x.toFixed(2)}, ${dotCentre.y.toFixed(2)}); ±1px allowed`,
        );
      }

      // The explicit `BlockSide` → `Position` mapping, read back off React
      // Flow's own `data-handlepos` attribute — proves the mapping was
      // actually applied per-edge, not assumed from array order. `BlockSide`
      // and `Position` share their runtime strings (`BLOCK_SIDE_TO_HANDLE_
      // POSITION`'s own doc), so `port.edge` is directly comparable.
      await expect(handle.getAttribute("data-handlepos")).toBe(port.edge);

      // `direction` → Handle `type`: React Flow stamps a bare `target`/
      // `source` class on every handle for exactly this purpose.
      const expectedType = port.direction === "input" ? "target" : "source";
      await expect(handle.classList.contains(expectedType)).toBe(true);
    }
  },
};
