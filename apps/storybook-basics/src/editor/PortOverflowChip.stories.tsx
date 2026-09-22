import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { PORT_EDGE_MORE_GAP_PX, PortEdge, type PortEdgeItem } from "../components/portEdge";
import { PortOverflowChip } from "./portOverflowChip";

/**
 * Blocks/Editor/Port Overflow Chip — RULING 7, 2026-09-21. Zach, on the
 * "+X more" chip: *"ideally this just comes from the port edge
 * implementation... but YOu do need to provide the chrome to do this...
 * should be in bbox-editor"*.
 *
 * That is a SPLIT, and this file exists to prove both halves are really on
 * opposite sides of it:
 *
 * - **the count and the cut** are `PortEdge`'s. The chip is never told
 *   `maxVisible`, never told `items`, and never sees the grouping — it is
 *   handed a finished `PortEdgeOverflow`. The `GroupedCut` story below is
 *   the one that makes this falsifiable: one slot is cut, three ports are
 *   hidden, and the chip reads **+3**. A chip counting anything for itself
 *   from what is on screen would say +1.
 * - **the chrome** is `editor/`'s. `components/` may not import `editor/`
 *   (ARCHITECTURE.md's DAG), so the seam is `PortEdge`'s `renderOverflow`
 *   render prop — this file is the reference host wiring, the same division
 *   of labour `EdgeDropMenu.stories.tsx` already establishes.
 *
 * What stays with `PortEdge` even so: WHERE the chrome lands. Only the
 * component that owns the track can measure the last visible port's box, so
 * it positions whatever node `renderOverflow` returns, and the placement
 * assertions below check that against the component's own exported
 * `PORT_EDGE_MORE_GAP_PX` rather than a number copied into this file.
 */
const meta = {
  title: "Editor/PortOverflowChip",
  tags: ["object:port", "lane:port-overflow-chip"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

const centreY = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.top + r.height / 2;
};

/* ------------------------------------------------------------------ */
/* The bench — a real capped PortEdge, chrome supplied from here.       */
/* ------------------------------------------------------------------ */

const ROSTER: PortEdgeItem[] = [
  { id: "args", label: "args", state: "empty", type: "tuple" },
  { id: "kwargs", label: "kwargs", state: "wired", type: "dict" },
  { id: "image", label: "image", state: "received", type: "Image" },
  { id: "pose", label: "pose", state: "empty", type: "Pose" },
  { id: "cfg", label: "cfg", state: "valueSet", type: "Config" },
  { id: "err", label: "err", state: "empty" },
];
const MAX_VISIBLE = 3;
const HIDDEN = ROSTER.slice(MAX_VISIBLE);

function ChipBench({
  benchId,
  edge,
  items = ROSTER,
  maxVisible = MAX_VISIBLE,
  groups,
}: {
  benchId: string;
  edge: "left" | "top";
  items?: PortEdgeItem[];
  maxVisible?: number;
  groups?: string;
}) {
  const [roster, setRoster] = useState<PortEdgeItem[]>(items);
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div data-testid={benchId} style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
      <PortEdge
        edge={edge}
        items={roster}
        onItemsChange={setRoster}
        maxVisible={maxVisible}
        groups={groups}
        groupMode={groups ? "grouped" : "off"}
        size={edge === "top" ? { width: 360, height: 90 } : { width: 200, height: 260 }}
        // THE SEAM. Everything the chip knows arrives in `overflow`; this
        // host passes nothing of its own but the pick handler.
        renderOverflow={(overflow) => <PortOverflowChip overflow={overflow} onSelect={(item) => setPicked(item.id)} />}
      />
      <span data-testid={`${benchId}-picked`} style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
        {picked ?? "—"}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ColumnEdge — the count, the placement, the disclosure, the pick.     */
/* ------------------------------------------------------------------ */

export const ColumnEdge: Story = {
  render: () => <ChipBench benchId="column" edge="left" />,
  play: async ({ canvasElement }) => {
    const bench = required<HTMLElement>(canvasElement, '[data-testid="column"]', "the column bench");
    const track = required<HTMLElement>(bench, '[data-slot="port-edge"]', "the track");

    // The cut itself: three of six ports on the track.
    await expect(track.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(MAX_VISIBLE);

    // The chip carries the COMPONENT's count — derived from the roster and
    // the cap, never from a literal typed here.
    const chip = await waitFor(() => required<HTMLButtonElement>(bench, '[data-slot="port-overflow-chip"]', "the overflow chip"));
    await expect(chip.textContent).toBe(`+${ROSTER.length - MAX_VISIBLE} more`);
    await expect(chip.getAttribute("aria-expanded")).toBe("false");

    // PLACEMENT, measured, against PortEdge's own exported constant: on a
    // column edge the chip sits directly under the last visible port's box,
    // left-aligned with it. This is the half of ruling 7 that stays with
    // the component — the chip does not know where it is.
    const members = Array.from(track.querySelectorAll('[data-slot="port-edge-member"]'));
    const last = members[members.length - 1];
    if (!(last instanceof HTMLElement)) throw new Error("expected a last visible port slot");
    const lastRect = last.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    await expect(Math.abs(chipRect.top - (lastRect.bottom + PORT_EDGE_MORE_GAP_PX))).toBeLessThanOrEqual(1);
    await expect(Math.abs(chipRect.left - lastRect.left)).toBeLessThanOrEqual(1);

    // DISCLOSURE: the count is honest on its own; the list is what makes it
    // discoverable. Exactly the hidden ports, in track order, by label.
    await expect(bench.querySelector('[data-slot="port-overflow-list"]')).toBeNull();
    await userEvent.click(chip);
    const list = await waitFor(() => required<HTMLElement>(bench, '[data-slot="port-overflow-list"]', "the hidden-port list"));
    await expect(chip.getAttribute("aria-expanded")).toBe("true");
    const rows = Array.from(list.querySelectorAll('[data-slot="port-overflow-item"]'));
    await expect(rows.map((r) => r.getAttribute("data-port-id"))).toEqual(HIDDEN.map((i) => i.id));

    // Truthful rendering: each row carries the port's stored label verbatim,
    // and the rows agree with the number on the chip.
    await expect(rows.map((r) => r.querySelector("span")?.textContent)).toEqual(HIDDEN.map((i) => i.label));
    await expect(rows).toHaveLength(ROSTER.length - MAX_VISIBLE);

    // PICK: reports which hidden port was chosen, and closes.
    const first = rows[0];
    if (!(first instanceof HTMLElement)) throw new Error("expected a row to pick");
    await userEvent.click(first);
    await waitFor(() => {
      expect(bench.querySelector('[data-slot="port-overflow-list"]')).toBeNull();
      expect(required<HTMLElement>(bench, '[data-testid="column-picked"]', "the pick readout").textContent).toBe(HIDDEN[0]?.id);
    });

    // Escape closes an open list without picking anything — the dismissal
    // idiom `edgeDropMenu.tsx` already established, reused not re-invented.
    await userEvent.click(chip);
    await waitFor(() => expect(bench.querySelector('[data-slot="port-overflow-list"]')).not.toBeNull());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(bench.querySelector('[data-slot="port-overflow-list"]')).toBeNull());
    await expect(required<HTMLElement>(bench, '[data-testid="column-picked"]', "the pick readout").textContent).toBe(HIDDEN[0]?.id);
  },
};

/* ------------------------------------------------------------------ */
/* RowEdge — the same chrome, the other axis.                          */
/* ------------------------------------------------------------------ */

export const RowEdge: Story = {
  render: () => <ChipBench benchId="row" edge="top" />,
  play: async ({ canvasElement }) => {
    const bench = required<HTMLElement>(canvasElement, '[data-testid="row"]', "the row bench");
    const track = required<HTMLElement>(bench, '[data-slot="port-edge"]', "the track");
    const chip = await waitFor(() => required<HTMLButtonElement>(bench, '[data-slot="port-overflow-chip"]', "the overflow chip"));

    await expect(chip.textContent).toBe(`+${ROSTER.length - MAX_VISIBLE} more`);

    // A row edge runs the other way, so the chip follows the last port
    // ALONG the track and centres on it, rather than dropping below — the
    // axis-aware half of `useMoreIndicatorPosition`, measured against the
    // same exported gap.
    const members = Array.from(track.querySelectorAll('[data-slot="port-edge-member"]'));
    const last = members[members.length - 1];
    if (!(last instanceof HTMLElement)) throw new Error("expected a last visible port slot");
    const lastRect = last.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    await expect(Math.abs(chipRect.left - (lastRect.right + PORT_EDGE_MORE_GAP_PX))).toBeLessThanOrEqual(1);
    await expect(Math.abs(centreY(chip) - centreY(last))).toBeLessThanOrEqual(1);
  },
};

/* ------------------------------------------------------------------ */
/* GroupedCut — the story that makes the split falsifiable.            */
/* ------------------------------------------------------------------ */

const GROUPED_ROSTER: PortEdgeItem[] = [
  { id: "a", label: "a", state: "empty" },
  { id: "b", label: "b", state: "empty" },
  { id: "c", label: "c", state: "empty" },
  { id: "x", label: "x", state: "wired" },
  { id: "y", label: "y", state: "wired" },
  { id: "z", label: "z", state: "wired" },
];
/** `x,y,z` render as ONE slot box. With a cap of 3, that single slot is the
 *  only thing cut — and it takes three ports with it. */
const GROUPED_GROUPS = "x,y,z";
const GROUPED_CAP = 3;

export const GroupedCut: Story = {
  render: () => <ChipBench benchId="grouped" edge="left" items={GROUPED_ROSTER} maxVisible={GROUPED_CAP} groups={GROUPED_GROUPS} />,
  play: async ({ canvasElement }) => {
    const bench = required<HTMLElement>(canvasElement, '[data-testid="grouped"]', "the grouped bench");
    const track = required<HTMLElement>(bench, '[data-slot="port-edge"]', "the track");

    // Three ungrouped ports are on the track; the `x,y,z` family is the one
    // slot past the cutoff.
    await expect(track.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(GROUPED_CAP);

    // RULING 7, stated as the one number that could be wrong: ONE slot was
    // cut, THREE ports went with it, and the chip says three. A chip that
    // counted cut boxes — the only thing it could count for itself without
    // the component's decision — would say "+1 more" and be believed.
    const chip = await waitFor(() => required<HTMLButtonElement>(bench, '[data-slot="port-overflow-chip"]', "the overflow chip"));
    await expect(chip.textContent).toBe("+3 more");
    await expect(chip.textContent).not.toBe("+1 more");

    // And the list names all three members of the cut family, in order.
    await userEvent.click(chip);
    const list = await waitFor(() => required<HTMLElement>(bench, '[data-slot="port-overflow-list"]', "the hidden-port list"));
    await expect(Array.from(list.querySelectorAll('[data-slot="port-overflow-item"]')).map((r) => r.getAttribute("data-port-id"))).toEqual(["x", "y", "z"]);
  },
};
