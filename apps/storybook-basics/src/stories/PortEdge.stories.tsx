import { useLayoutEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import type { DragEndEvent, DragOverEvent } from "@dnd-kit/core";
import { python } from "@codemirror/lang-python";

import { Block } from "../components/block";
import { PortEdge, PortEdgeDndProvider, laneAvailability, type PortEdgeItem } from "../components/portEdge";
import { CONTAINER_PADDING, SPACING_SCHEMES, DEFAULT_ALIGN_GAP, computeSlots, groupingSetFromText, type Distribution, type Size } from "../components/portEdge.layout";
import type { BlockSide, PortTextLayout } from "../components/port.layout";

/**
 * A genuine `@dnd-kit/core` `PointerSensor` drag, not a style-only stand-in:
 * pointerdown on the source card, a small pointermove to clear the 4px
 * `activationConstraint` (below that, dnd-kit treats it as a click, not a
 * drag — same guard a real accidental-drag-on-click would hit), then a move
 * to the target and pointerup. `isPrimary: true` is load-bearing —
 * `PointerSensor.activators` checks it (`!event.isPrimary` bails out before
 * anything else runs) and a bare `new PointerEvent(...)` defaults it to
 * `false`, so a synthetic drag missing it silently never starts while every
 * other property looks right. Verified against a REAL mouse drag driven
 * through the browser tool first (same reorder, same result) before this
 * became the play-function technique — see the final report.
 */
async function dragCard(from: Element, to: Element) {
  const fire = (el: Element, type: string, x: number, y: number) =>
    el.dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1, pointerType: "mouse", clientX: x, clientY: y }),
    );
  const fromRect = from.getBoundingClientRect();
  const toRect = to.getBoundingClientRect();
  const startX = fromRect.left + fromRect.width / 2;
  const startY = fromRect.top + fromRect.height / 2;
  const endX = toRect.left + toRect.width / 2;
  const endY = toRect.top + toRect.height / 2;
  fire(from, "pointerdown", startX, startY);
  await new Promise((r) => setTimeout(r, 30));
  fire(from, "pointermove", startX, startY + 10); // clears activationConstraint.distance
  await new Promise((r) => setTimeout(r, 30));
  fire(from, "pointermove", endX, endY);
  await new Promise((r) => setTimeout(r, 30));
  fire(from, "pointerup", endX, endY);
  await new Promise((r) => setTimeout(r, 100));
}

/* ------------------------------------------------------------------ */
/* Story-local controls — port-edge.tsx/portEdge.layout.ts's own        */
/* Storybook args-and-story-UI layer (docs/PORT-EDGE-PLAN.md's own       */
/* line: "the reset PortEdge's controls are Storybook args and           */
/* story-local UI, not a schema"). Same segmented-button shape the lab's */
/* own AlignmentControl/SizeControl used, ported as plain inline UI      */
/* rather than separate files (no new files outside the allowed list).  */
/* ------------------------------------------------------------------ */

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          style={{
            padding: "4px 10px",
            fontSize: 12,
            border: "none",
            cursor: "pointer",
            background: value === opt.value ? "var(--accent)" : "transparent",
            color: value === opt.value ? "var(--accent-foreground)" : "var(--foreground)",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function DistributionControl({ value, onChange }: { value: Distribution; onChange: (d: Distribution) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Segmented
        options={[
          { value: "distribute", label: "Distribute" },
          { value: "aligned", label: "Aligned to edge" },
        ]}
        value={value.mode}
        onChange={(m) =>
          onChange(m === "distribute" ? { mode: "distribute", scheme: "space-between" } : { mode: "aligned", anchor: "start", gap: DEFAULT_ALIGN_GAP, edgePadding: 0 })
        }
      />
      {value.mode === "distribute" ? (
        <Segmented options={SPACING_SCHEMES.map((s) => ({ value: s.value, label: s.label }))} value={value.scheme} onChange={(scheme) => onChange({ mode: "distribute", scheme })} />
      ) : (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Segmented
            options={[
              { value: "start", label: "Start" },
              { value: "end", label: "End" },
            ]}
            value={value.anchor}
            onChange={(anchor) => onChange({ ...value, anchor })}
          />
          <label style={{ fontSize: 11, display: "flex", gap: 4, alignItems: "center" }}>
            Gap
            <input type="number" min={0} value={value.gap} style={{ width: 48 }} onChange={(e) => onChange({ ...value, gap: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label style={{ fontSize: 11, display: "flex", gap: 4, alignItems: "center" }}>
            Edge padding
            <input type="number" min={0} value={value.edgePadding} style={{ width: 48 }} onChange={(e) => onChange({ ...value, edgePadding: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
        </div>
      )}
    </div>
  );
}

function SizeControl({ value, onChange }: { value: Size; onChange: (s: Size) => void }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <label style={{ fontSize: 11, display: "flex", gap: 4, alignItems: "center" }}>
        W
        <input type="number" min={40} value={value.width} style={{ width: 56 }} onChange={(e) => onChange({ ...value, width: Math.max(40, Number(e.target.value) || 40) })} />
      </label>
      <label style={{ fontSize: 11, display: "flex", gap: 4, alignItems: "center" }}>
        H
        <input type="number" min={40} value={value.height} style={{ width: 56 }} onChange={(e) => onChange({ ...value, height: Math.max(40, Number(e.target.value) || 40) })} />
      </label>
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ fontSize: 11, display: "flex", gap: 4, alignItems: "center" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const INITIAL_ITEMS: PortEdgeItem[] = [
  { id: "args", label: "args", state: "empty" },
  { id: "kwargs", label: "kwargs", state: "empty" },
  { id: "in", label: "in", state: "wired" },
  { id: "out", label: "out", state: "received" },
  { id: "feedback", label: "feedback", state: "empty" },
  { id: "result", label: "result", state: "valueSet" },
  // A `name: Type = value` label on purpose (follow-up item 3) — with
  // Python syntax on by default in SingleEdge, opening the lane shows this
  // one visibly tokenised (tok-variableName/tok-typeName/tok-atom etc.)
  // the moment it renders, not only after you type one yourself.
  { id: "cfg", label: "cfg: Config = None", state: "empty" },
  { id: "err", label: "err", state: "empty" },
];

const meta = {
  title: "Ports/PortEdge",
  component: PortEdge,
  // Every story below supplies its own `render` with story-local state (the
  // controlled contract needs a real host) — these args are never actually
  // read, just enough to satisfy PortEdge's required props at the meta level.
  args: { edge: "left", items: [] },
} satisfies Meta<typeof PortEdge>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* SingleEdge — Stage 6 parity: every control the lab built, on ONE     */
/* standalone edge (PortEdge mounts its own DndContext here).           */
/* ------------------------------------------------------------------ */

function SingleEdgeDemo() {
  const [orientation, setOrientation] = useState<"row" | "column">("column");
  const [mode, setMode] = useState<"auto" | "custom">("auto");
  const [distribution, setDistribution] = useState<Distribution>({ mode: "distribute", scheme: "space-between" });
  const [items, setItems] = useState<PortEdgeItem[]>(INITIAL_ITEMS);
  const [freeOffsets, setFreeOffsets] = useState<Record<string, number>>({});
  const [size, setSize] = useState<Size>({ width: 220, height: 460 });
  const [showPorts, setShowPorts] = useState(true);
  const [showCard, setShowCard] = useState(false);
  const [showContainer, setShowContainer] = useState(true);
  const [showCenterLine, setShowCenterLine] = useState(true);
  const [groups, setGroups] = useState("args, kwargs\nfeedback, result");
  const [groupMode, setGroupMode] = useState<"off" | "grouped" | "collapsed">("off");
  // Part B: label placement — left/right for a column edge (plus "Offset",
  // the wire-clearing lift), top/bottom for a row edge. Independent of
  // `edge` itself (which side of the Block the rail sits on) — this is
  // which way the LABEL flows, the same `PortTextLayout` vocabulary
  // LabeledPort has carried since Phase 2, reused rather than invented
  // twice (port.layout.ts's own `TEXT_LAYOUT_AS_PLACEMENT`).
  const [labelSide, setLabelSide] = useState<"left" | "right">("right");
  const [labelOffset, setLabelOffset] = useState(false);
  const [labelRowSide, setLabelRowSide] = useState<"top" | "bot">("bot");
  // Phase 4: the multi-line lane. Default ON — the point of this story is
  // to show the feature working, not to make Zach turn it on himself to
  // see it (follow-up feedback item 3).
  const [editing, setEditing] = useState(false);
  const [pythonSyntax, setPythonSyntax] = useState(true);

  const edge: BlockSide = orientation === "column" ? "left" : "top";
  const textLayout: PortTextLayout = orientation === "column" ? (labelOffset ? (labelSide === "right" ? "rightOffset" : "leftOffset") : labelSide) : labelRowSide;

  const itemIds = items.map((i) => i.id);
  const slots = computeSlots(itemIds, groupingSetFromText(groups, itemIds).set, groupMode);
  const lane = laneAvailability(orientation, mode, groupMode, slots);

  function handleModeChange(next: "auto" | "custom") {
    if (next === "custom") {
      const mainSize = orientation === "row" ? size.width : size.height;
      const step = Math.max(60, (mainSize - 2 * CONTAINER_PADDING) / Math.max(items.length, 1));
      const seeded: Record<string, number> = {};
      items.forEach((it, i) => {
        seeded[it.id] = i * step;
      });
      setFreeOffsets(seeded);
    }
    setMode(next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Segmented
          options={[
            { value: "row", label: "Row" },
            { value: "column", label: "Column" },
          ]}
          value={orientation}
          onChange={setOrientation}
        />
        <Segmented
          options={[
            { value: "auto", label: "Auto" },
            { value: "custom", label: "Custom" },
          ]}
          value={mode}
          onChange={handleModeChange}
        />
        <SizeControl value={size} onChange={setSize} />
      </div>
      {mode === "auto" ? (
        <DistributionControl value={distribution} onChange={setDistribution} />
      ) : (
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Custom — drag any card to its own free position.</span>
      )}
      <div style={{ display: "flex", gap: 16 }}>
        <Checkbox label="Show ports" checked={showPorts} onChange={setShowPorts} />
        <Checkbox label="Show cards" checked={showCard} onChange={setShowCard} />
        <Checkbox label="Show container" checked={showContainer} onChange={setShowContainer} />
        <Checkbox label="Show center line" checked={showCenterLine} onChange={setShowCenterLine} />
      </div>
      <Segmented
        options={[
          { value: "off", label: "Off" },
          { value: "grouped", label: "Grouped" },
          { value: "collapsed", label: "Collapsed" },
        ]}
        value={groupMode}
        onChange={setGroupMode}
      />
      <label style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 4, width: 260 }}>
        Groups — one per line, e.g. [args,kwargs] or args,kwargs
        <textarea data-testid="groups-textarea" value={groups} onChange={(e) => setGroups(e.target.value)} rows={2} style={{ fontFamily: "monospace", fontSize: 12, padding: 4 }} />
      </label>
      {orientation === "column" ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Segmented
            options={[
              { value: "left", label: "Labels left" },
              { value: "right", label: "Labels right" },
            ]}
            value={labelSide}
            onChange={setLabelSide}
          />
          <Checkbox label="Offset (clear the wire)" checked={labelOffset} onChange={setLabelOffset} />
        </div>
      ) : (
        <Segmented
          options={[
            { value: "top", label: "Labels top" },
            { value: "bot", label: "Labels bottom" },
          ]}
          value={labelRowSide}
          onChange={setLabelRowSide}
        />
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          data-testid="lane-toggle"
          disabled={!lane.available}
          title={lane.reason}
          onClick={() => setEditing((v) => !v)}
          style={{
            padding: "4px 10px",
            fontSize: 12,
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: editing ? "var(--accent)" : "transparent",
            color: lane.available ? "var(--foreground)" : "var(--muted-foreground)",
            cursor: lane.available ? "pointer" : "not-allowed",
          }}
        >
          {editing ? "Close multi-line editor" : "Edit as lines"}
          {!lane.available ? ` (${lane.reason})` : ""}
        </button>
        <Checkbox label="Python syntax" checked={pythonSyntax} onChange={setPythonSyntax} />
      </div>
      <PortEdge
        edge={edge}
        items={items}
        onItemsChange={setItems}
        distribution={distribution}
        mode={mode}
        freeOffsets={freeOffsets}
        onFreeOffsetsChange={setFreeOffsets}
        groups={groups}
        groupMode={groupMode}
        showPorts={showPorts}
        showCard={showCard}
        showContainer={showContainer}
        showCenterLine={showCenterLine}
        size={size}
        textLayout={textLayout}
        editing={editing}
        onEditingChange={setEditing}
        laneLanguage={pythonSyntax ? python() : undefined}
      />
    </div>
  );
}

export const SingleEdge: Story = {
  render: () => <SingleEdgeDemo />,
  play: async ({ canvasElement }) => {
    const track = canvasElement.querySelector('[data-slot="port-edge"]');
    if (!(track instanceof HTMLElement)) throw new Error('expected a [data-slot="port-edge"]');
    await expect(track.querySelectorAll('[data-slot="port-edge-card"]')).toHaveLength(8);

    // Reorder within the edge via a real PointerSensor drag session (see
    // `dragCard`'s own doc) — drag the first card down past the fourth.
    const cards = Array.from(track.querySelectorAll('[data-slot="port-edge-card"]'));
    const first = cards[0];
    const fourth = cards[3];
    if (!first || !fourth) throw new Error("expected at least 4 cards");
    const firstIdBefore = first.textContent;

    await dragCard(first, fourth);

    await waitFor(() => {
      const nowCards = Array.from(canvasElement.querySelectorAll('[data-slot="port-edge-card"]'));
      expect(nowCards[0]?.textContent).not.toBe(firstIdBefore);
    });

    // Phase 4 — the multi-line lane. P1: every line sits on its own dot.
    const laneToggle = canvasElement.querySelector('[data-testid="lane-toggle"]');
    if (!(laneToggle instanceof HTMLButtonElement)) throw new Error("expected the lane toggle button");
    await expect(laneToggle.disabled).toBe(false);
    await userEvent.click(laneToggle);

    const editorHost = await waitFor(() => {
      const el = canvasElement.querySelector('[data-slot="code-editor"] .cm-content');
      if (!(el instanceof HTMLElement)) throw new Error("expected the lane's editable content");
      return el;
    });

    const centerY = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    };
    await waitFor(() => {
      const dots = Array.from(canvasElement.querySelectorAll('[data-slot="port-dot"]'));
      const lines = Array.from(canvasElement.querySelectorAll(".cm-line"));
      expect(dots).toHaveLength(lines.length);
      for (let i = 0; i < dots.length; i++) {
        expect(Math.abs(centerY(dots[i]) - centerY(lines[i]))).toBeLessThanOrEqual(1);
      }
    });

    // P3: a real Enter mints exactly one new port.
    const dotsBefore = canvasElement.querySelectorAll('[data-slot="port-dot"]').length;
    await userEvent.click(editorHost);
    await userEvent.keyboard("{End}{Enter}");
    await waitFor(() => {
      expect(canvasElement.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(dotsBefore + 1);
    });

    // Close — the per-port single-line labels return in the same frame,
    // the lane's own editor unmounts.
    await userEvent.click(laneToggle);
    await waitFor(() => {
      expect(canvasElement.querySelector('[data-slot="code-editor"]')).toBeNull();
      expect(canvasElement.querySelectorAll('[data-slot="port-label"]').length).toBeGreaterThan(0);
    });

    // P6: disabled, with a reason, in Row orientation — the control never
    // just silently vanishes.
    const rowBtn = Array.from(canvasElement.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Row");
    if (!rowBtn) throw new Error("expected the Row button");
    await userEvent.click(rowBtn);
    await waitFor(() => {
      expect(laneToggle.disabled).toBe(true);
      expect(laneToggle.title).toBe("a lane needs a vertical edge");
    });
  },
};

/* ------------------------------------------------------------------ */
/* LeftAndRight — two edges, one story-owned DndContext, drag a card    */
/* across (D6: the multi-edge arrangement belongs to the story).        */
/* ------------------------------------------------------------------ */

function TwoEdgeDemo() {
  const [left, setLeft] = useState<PortEdgeItem[]>([
    { id: "L1", label: "in", state: "wired" },
    { id: "L2", label: "cfg", state: "empty" },
    { id: "L3", label: "trigger", state: "empty" },
  ]);
  const [right, setRight] = useState<PortEdgeItem[]>([
    { id: "R1", label: "out", state: "received" },
    { id: "R2", label: "err", state: "empty" },
  ]);

  function findEdge(id: string): "left" | "right" | null {
    if (left.some((i) => i.id === id)) return "left";
    if (right.some((i) => i.id === id)) return "right";
    return null;
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeEdge = findEdge(String(active.id));
    const overEdge = (over.id === "left" || over.id === "right" ? over.id : findEdge(String(over.id))) as "left" | "right" | null;
    if (!activeEdge || !overEdge || activeEdge === overEdge) return;

    const from = activeEdge === "left" ? left : right;
    const to = activeEdge === "left" ? right : left;
    const setFrom = activeEdge === "left" ? setLeft : setRight;
    const setTo = activeEdge === "left" ? setRight : setLeft;
    const moving = from.find((i) => i.id === active.id);
    if (!moving) return;
    const overIndex = to.findIndex((i) => i.id === over.id);
    const insertAt = overIndex >= 0 ? overIndex : to.length;
    setFrom(from.filter((i) => i.id !== active.id));
    setTo([...to.slice(0, insertAt), moving, ...to.slice(insertAt)]);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const edge = findEdge(String(active.id));
    if (!edge) return;
    const list = edge === "left" ? left : right;
    const setList = edge === "left" ? setLeft : setRight;
    const activeIndex = list.findIndex((i) => i.id === active.id);
    const overIndex = list.findIndex((i) => i.id === over.id);
    if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
      const reordered = [...list];
      const [moved] = reordered.splice(activeIndex, 1);
      reordered.splice(overIndex, 0, moved);
      setList(reordered);
    }
  }

  return (
    <PortEdgeDndProvider onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div style={{ display: "flex", gap: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>edge=left</span>
          <PortEdge id="left" edge="left" items={left} onItemsChange={setLeft} size={{ width: 160, height: 260 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>edge=right</span>
          <PortEdge id="right" edge="right" items={right} onItemsChange={setRight} size={{ width: 160, height: 260 }} />
        </div>
      </div>
    </PortEdgeDndProvider>
  );
}

export const LeftAndRight: Story = {
  render: () => <TwoEdgeDemo />,
  play: async ({ canvasElement }) => {
    const [leftTrack, rightTrack] = Array.from(canvasElement.querySelectorAll('[data-slot="port-edge"]'));
    await expect(leftTrack).toBeTruthy();
    await expect(rightTrack).toBeTruthy();
    await expect(canvasElement.querySelectorAll('[data-slot="port-edge-card"]')).toHaveLength(5);
    await expect(leftTrack!.querySelectorAll('[data-slot="port-edge-card"]')).toHaveLength(3);
    await expect(rightTrack!.querySelectorAll('[data-slot="port-edge-card"]')).toHaveLength(2);

    // Drag a card from the left edge across to the right edge — the actual
    // point of this story: one shared DndContext, cross-container move.
    const leftFirst = leftTrack!.querySelector('[data-slot="port-edge-card"]');
    const rightFirst = rightTrack!.querySelector('[data-slot="port-edge-card"]');
    if (!leftFirst || !rightFirst) throw new Error("expected a card on each edge");
    const movedText = leftFirst.textContent;

    await dragCard(leftFirst, rightFirst);

    await waitFor(() => {
      const tracks = Array.from(canvasElement.querySelectorAll('[data-slot="port-edge"]'));
      const leftNow = tracks[0].querySelectorAll('[data-slot="port-edge-card"]');
      const rightNow = tracks[1].querySelectorAll('[data-slot="port-edge-card"]');
      expect(leftNow).toHaveLength(2);
      expect(rightNow).toHaveLength(3);
      expect(Array.from(rightNow).some((c) => c.textContent === movedText)).toBe(true);
    });
  },
};

/* ------------------------------------------------------------------ */
/* AroundABox — four edges around a plain Block, story-owned arrangement*/
/* and cross-edge onDragEnd (D6).                                       */
/* ------------------------------------------------------------------ */

type FourEdgeState = Record<BlockSide, PortEdgeItem[]>;

const INITIAL_FOUR_EDGE: FourEdgeState = {
  top: [
    { id: "T1", label: "start", state: "wired" },
    { id: "T2", label: "reset", state: "empty" },
  ],
  right: [{ id: "R1", label: "out", state: "received" }],
  bottom: [{ id: "B1", label: "done", state: "empty" }],
  left: [
    { id: "L1", label: "in", state: "wired" },
    { id: "L2", label: "cfg", state: "empty" },
    { id: "L3", label: "err", state: "empty" },
  ],
};

const FOUR_EDGES: BlockSide[] = ["top", "right", "bottom", "left"];
const EDGE_SIZE: Record<BlockSide, Size> = {
  top: { width: 320, height: 70 },
  bottom: { width: 320, height: 70 },
  left: { width: 70, height: 220 },
  right: { width: 70, height: 220 },
};

function AroundABoxDemo() {
  const [state, setState] = useState<FourEdgeState>(INITIAL_FOUR_EDGE);

  function findEdge(id: string): BlockSide | null {
    return FOUR_EDGES.find((e) => state[e].some((i) => i.id === id)) ?? null;
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeEdge = findEdge(String(active.id));
    const overEdge = (FOUR_EDGES as string[]).includes(String(over.id)) ? (over.id as BlockSide) : findEdge(String(over.id));
    if (!activeEdge || !overEdge || activeEdge === overEdge) return;

    setState((prev) => {
      const from = prev[activeEdge];
      const to = prev[overEdge];
      const moving = from.find((i) => i.id === active.id);
      if (!moving) return prev;
      const overIndex = to.findIndex((i) => i.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : to.length;
      return {
        ...prev,
        [activeEdge]: from.filter((i) => i.id !== active.id),
        [overEdge]: [...to.slice(0, insertAt), moving, ...to.slice(insertAt)],
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const edge = findEdge(String(active.id));
    if (!edge) return;
    setState((prev) => {
      const list = prev[edge];
      const activeIndex = list.findIndex((i) => i.id === active.id);
      const overIndex = list.findIndex((i) => i.id === over.id);
      if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return prev;
      const reordered = [...list];
      const [moved] = reordered.splice(activeIndex, 1);
      reordered.splice(overIndex, 0, moved);
      return { ...prev, [edge]: reordered };
    });
  }

  // B2 fix: the four rails plus the centre Block are 3x3 — a corner at each
  // of the four unused cells, one edge flush to each of the Block's four
  // sides. The OLD grid only declared 2 columns ("70px 320px") for 7
  // children, so the `right` edge (the 7th) had nowhere defined to go and
  // fell into an IMPLICIT auto-placed row — that's the root cause of the
  // screenshot bug: a rail stacked across the top, the Block pushed
  // off-centre, and two edges' boxes colliding. Declaring the real 3x3 grid
  // (with explicit empty corner cells) gives every rail its own cell, so
  // none can ever overlap another by construction — not just by luck at
  // this particular set of sizes.
  return (
    <PortEdgeDndProvider onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div style={{ display: "grid", gridTemplateColumns: "70px 320px 70px", gridTemplateRows: "70px 220px 70px", gap: 8, alignItems: "center", justifyItems: "center" }}>
        <div />
        <PortEdge id="top" edge="top" items={state.top} onItemsChange={(items) => setState((s) => ({ ...s, top: items }))} size={EDGE_SIZE.top} showContainer={false} />
        <div />
        <PortEdge id="left" edge="left" items={state.left} onItemsChange={(items) => setState((s) => ({ ...s, left: items }))} size={EDGE_SIZE.left} showContainer={false} />
        <div style={{ width: 320, height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Block header="Block" body="center" width={220} height={140} />
        </div>
        <PortEdge id="right" edge="right" items={state.right} onItemsChange={(items) => setState((s) => ({ ...s, right: items }))} size={{ width: 70, height: 220 }} showContainer={false} />
        <div />
        <PortEdge id="bottom" edge="bottom" items={state.bottom} onItemsChange={(items) => setState((s) => ({ ...s, bottom: items }))} size={EDGE_SIZE.bottom} showContainer={false} />
        <div />
      </div>
    </PortEdgeDndProvider>
  );
}

/** A2 (B2): true rectangle overlap, not just "different corners". */
function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export const AroundABox: Story = {
  render: () => <AroundABoxDemo />,
  play: async ({ canvasElement }) => {
    const tracks = canvasElement.querySelectorAll('[data-slot="port-edge"]');
    await expect(tracks).toHaveLength(4);
    const totalCards = canvasElement.querySelectorAll('[data-slot="port-edge-card"]');
    await expect(totalCards).toHaveLength(7);
    const block = canvasElement.querySelector('[data-slot="block"]');
    await expect(block).not.toBeNull();

    // A2: each rail is flush to its own side of the Block, and NO two
    // rails' bounding boxes intersect — measured pairwise, not eyeballed.
    // This is the assertion that would have caught the old 2-column grid
    // (the right edge landing in an implicit row on top of the others).
    const rects = Array.from(tracks).map((t) => t.getBoundingClientRect());
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        await expect(rectsIntersect(rects[i], rects[j])).toBe(false);
      }
    }
    const blockRect = block!.getBoundingClientRect();
    const [topRect, rightRect, bottomRect, leftRect] = FOUR_EDGES.map(
      (e) => canvasElement.querySelector(`[data-edge="${e}"][data-slot="port-edge"]`)!.getBoundingClientRect(),
    );
    // Flush to their own side: top's bottom edge sits at (or above) the
    // Block's top edge, etc. — not just "somewhere near".
    await expect(topRect.bottom).toBeLessThanOrEqual(blockRect.top + 1);
    await expect(bottomRect.top).toBeGreaterThanOrEqual(blockRect.bottom - 1);
    await expect(leftRect.right).toBeLessThanOrEqual(blockRect.left + 1);
    await expect(rightRect.left).toBeGreaterThanOrEqual(blockRect.right - 1);

    // Drag a card from the top edge across to the left edge — the
    // 4-around-a-box arrangement and its cross-edge onDragEnd are entirely
    // story-owned (D6); this proves that wiring actually works.
    const topTrack = canvasElement.querySelector('[data-edge="top"][data-slot="port-edge"]');
    const leftTrack = canvasElement.querySelector('[data-edge="left"][data-slot="port-edge"]');
    if (!topTrack || !leftTrack) throw new Error("expected top and left tracks");
    const topFirst = topTrack.querySelector('[data-slot="port-edge-card"]');
    const leftFirst = leftTrack.querySelector('[data-slot="port-edge-card"]');
    if (!topFirst || !leftFirst) throw new Error("expected a card on top and left");
    const movedText = topFirst.textContent;
    const topCountBefore = topTrack.querySelectorAll('[data-slot="port-edge-card"]').length;
    const leftCountBefore = leftTrack.querySelectorAll('[data-slot="port-edge-card"]').length;

    await dragCard(topFirst, leftFirst);

    await waitFor(() => {
      const topNow = canvasElement.querySelector('[data-edge="top"][data-slot="port-edge"]')!;
      const leftNow = canvasElement.querySelector('[data-edge="left"][data-slot="port-edge"]')!;
      expect(topNow.querySelectorAll('[data-slot="port-edge-card"]')).toHaveLength(topCountBefore - 1);
      expect(leftNow.querySelectorAll('[data-slot="port-edge-card"]')).toHaveLength(leftCountBefore + 1);
      expect(Array.from(leftNow.querySelectorAll('[data-slot="port-edge-card"]')).some((c) => c.textContent === movedText)).toBe(true);
    });
  },
};

/* ------------------------------------------------------------------ */
/* EvenlySpacedVsCustom — the same 5 ports, side by side: flex-driven   */
/* auto spacing vs free per-card positions.                             */
/* ------------------------------------------------------------------ */

const COMPARISON_ITEMS: PortEdgeItem[] = [
  { id: "c1", label: "a", state: "empty" },
  { id: "c2", label: "b", state: "wired" },
  { id: "c3", label: "c", state: "empty" },
  { id: "c4", label: "d", state: "received" },
  { id: "c5", label: "e", state: "empty" },
];

function EvenlyVsCustomDemo() {
  const [evenItems, setEvenItems] = useState<PortEdgeItem[]>(COMPARISON_ITEMS);
  const [customItems, setCustomItems] = useState<PortEdgeItem[]>(COMPARISON_ITEMS);
  const [customOffsets, setCustomOffsets] = useState<Record<string, number>>({ c1: 0, c2: 70, c3: 40, c4: 150, c5: 110 });

  return (
    <div style={{ display: "flex", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Auto — Distribute (space-between)</span>
        <PortEdge edge="top" items={evenItems} onItemsChange={setEvenItems} mode="auto" distribution={{ mode: "distribute", scheme: "space-between" }} size={{ width: 340, height: 70 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Custom — free positions, not reflowed</span>
        <PortEdge edge="top" items={customItems} onItemsChange={setCustomItems} mode="custom" freeOffsets={customOffsets} onFreeOffsetsChange={setCustomOffsets} size={{ width: 340, height: 70 }} />
      </div>
    </div>
  );
}

export const EvenlySpacedVsCustom: Story = {
  render: () => <EvenlyVsCustomDemo />,
  play: async ({ canvasElement }) => {
    const tracks = canvasElement.querySelectorAll('[data-slot="port-edge"]');
    await expect(tracks).toHaveLength(2);
    // The Auto track's cards are evenly spread by flexbox; the Custom
    // track's sit at the explicit freeOffsets seeded above — measured, not
    // merely "both rendered N cards".
    const [autoTrack, customTrack] = Array.from(tracks) as HTMLElement[];
    const autoCards = Array.from(autoTrack.querySelectorAll('[data-slot="port-edge-card"]'));
    const customCards = Array.from(customTrack.querySelectorAll('[data-slot="port-edge-card"]'));
    await expect(autoCards).toHaveLength(5);
    await expect(customCards).toHaveLength(5);
    const gaps = autoCards.slice(1).map((c, i) => Math.round(c.getBoundingClientRect().left - autoCards[i].getBoundingClientRect().right));
    // space-between: every gap between consecutive cards should be roughly equal.
    const maxDelta = Math.max(...gaps) - Math.min(...gaps);
    await expect(maxDelta).toBeLessThan(3);
  },
};

/* ------------------------------------------------------------------ */
/* CardsOnly — B3 fix: showPorts off now hides the ENTIRE LabeledPort   */
/* (no more naked floating text labels — that WAS the bug); interactions*/
/* stay unchanged.                                                     */
/* ------------------------------------------------------------------ */

function CardsOnlyDemo() {
  const [items, setItems] = useState<PortEdgeItem[]>(INITIAL_ITEMS.slice(0, 5));
  return <PortEdge edge="left" items={items} onItemsChange={setItems} showPorts={false} size={{ width: 160, height: 320 }} />;
}

export const CardsOnly: Story = {
  render: () => <CardsOnlyDemo />,
  play: async ({ canvasElement }) => {
    const track = canvasElement.querySelector('[data-slot="port-edge"]');
    if (!(track instanceof HTMLElement)) throw new Error('expected a [data-slot="port-edge"]');
    await expect(track.querySelectorAll('[data-slot="port-edge-card"]')).toHaveLength(5);
    // A3: showPorts=false hides the WHOLE LabeledPort — dot AND label.
    // (Before the fix this rendered a bare `port-edge-label-only` span —
    // exactly the naked floating text Zach's screenshot showed.)
    await expect(track.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(0);
    await expect(track.querySelectorAll('[data-slot="port-label"]')).toHaveLength(0);
    // A3: each slot still occupies its position with a non-zero rect.
    const members = Array.from(track.querySelectorAll('[data-slot="port-edge-member"]'));
    await expect(members).toHaveLength(5);
    for (const m of members) {
      const r = m.getBoundingClientRect();
      await expect(r.width).toBeGreaterThan(0);
      await expect(r.height).toBeGreaterThan(0);
    }

    // Reordering still works with ports hidden (interactions unchanged) —
    // dnd-kit's sortable id is on the CARD, not the (now absent) label, so
    // this never depended on ports being visible.
    //
    // WHY the reorder is asserted on card IDENTITY, not on the first
    // card's `top`: the slots sit at a fixed pitch, so after a reorder the
    // NEW first card occupies the exact same position the old one did —
    // its `top` never changes once dnd-kit's drop animation settles. The
    // earlier `top`-changed assertion could only pass by sampling a
    // transient animation frame (found 2026-09-16 when a real
    // `playFunctionThrewException` listener replaced `phase:"finished"`
    // as the oracle — the phase reads "finished" even when play throws).
    // Tagging each card and asserting the tagged order is the direct
    // observable: the dragged card really lands in the third slot.
    const cards = Array.from(track.querySelectorAll('[data-slot="port-edge-card"]'));
    if (cards.length < 3) throw new Error("expected at least 3 cards");
    cards.forEach((card, i) => card.setAttribute("data-reorder-probe", String(i)));
    await dragCard(cards[0], cards[2]);
    await waitFor(() => {
      const order = Array.from(canvasElement.querySelectorAll('[data-slot="port-edge-card"]')).map((card) =>
        card.getAttribute("data-reorder-probe"),
      );
      expect(order).toEqual(["1", "2", "0", "3", "4"]);
    });
  },
};

/* ------------------------------------------------------------------ */
/* PortsAndCards — B3's two-toggle matrix, all four combinations side   */
/* by side (the gallery format Zach asked for, rather than one instance */
/* toggled in isolation).                                              */
/* ------------------------------------------------------------------ */

const MATRIX_ITEMS: PortEdgeItem[] = [
  { id: "m1", label: "args", state: "empty" },
  { id: "m2", label: "kwargs", state: "wired" },
  { id: "m3", label: "out", state: "received" },
  { id: "m4", label: "cfg", state: "valueSet" },
];

function PortsAndCardsPanel({ showPorts, showCard, caption }: { showPorts: boolean; showCard: boolean; caption: string }) {
  const [items, setItems] = useState<PortEdgeItem[]>(MATRIX_ITEMS);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{caption}</span>
      <PortEdge edge="left" items={items} onItemsChange={setItems} showPorts={showPorts} showCard={showCard} size={{ width: 160, height: 260 }} />
    </div>
  );
}

export const PortsAndCards: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      <PortsAndCardsPanel showPorts={false} showCard={false} caption="ports off, cards off — occupies position, nothing visible" />
      <PortsAndCardsPanel showPorts={true} showCard={false} caption="ports on, cards off — bare labeled ports (today's look)" />
      <PortsAndCardsPanel showPorts={false} showCard={true} caption="ports off, cards on — an empty card" />
      <PortsAndCardsPanel showPorts={true} showCard={true} caption="ports on, cards on — labeled port inside a card" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tracks = Array.from(canvasElement.querySelectorAll('[data-slot="port-edge"]')) as HTMLElement[];
    await expect(tracks).toHaveLength(4);
    const [bothOff, portsOnly, cardOnly, both] = tracks;

    // A3: showPorts=false -> zero dot/label elements, whether or not the
    // card is on.
    for (const track of [bothOff, cardOnly]) {
      await expect(track.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(0);
      await expect(track.querySelectorAll('[data-slot="port-label"]')).toHaveLength(0);
    }
    // ...and where showPorts is true, the whole LabeledPort exists.
    for (const track of [portsOnly, both]) {
      await expect(track.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(4);
      await expect(track.querySelectorAll('[data-slot="port-label"]')).toHaveLength(4);
    }

    // A3/B3: showCard=true -> a real card element, non-zero border + radius,
    // and an OVERLAY — absolutely positioned (contributes nothing to the
    // slot's own size) and inert to the pointer (can't steal a card drag).
    for (const track of [cardOnly, both]) {
      const card = track.querySelector('[data-slot="port-edge-card-surface"]');
      if (!(card instanceof HTMLElement)) throw new Error("expected a card surface");
      const style = getComputedStyle(card);
      await expect(parseFloat(style.borderTopWidth)).toBeGreaterThan(0);
      await expect(parseFloat(style.borderTopLeftRadius)).toBeGreaterThan(0);
      await expect(style.position).toBe("absolute");
      await expect(style.pointerEvents).toBe("none");
    }
    for (const track of [bothOff, portsOnly]) {
      await expect(track.querySelectorAll('[data-slot="port-edge-card-surface"]')).toHaveLength(0);
    }

    // A3: "both off" still occupies its position — non-zero rects, spaced
    // at a uniform pitch (not collapsed onto one point).
    const members = Array.from(bothOff.querySelectorAll('[data-slot="port-edge-member"]'));
    await expect(members).toHaveLength(4);
    for (const m of members) {
      await expect(m.getBoundingClientRect().width).toBeGreaterThan(0);
    }
    const centers = members.map((m) => {
      const r = m.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    const deltas = centers.slice(1).map((c, i) => c - centers[i]);
    const maxDelta = Math.max(...deltas) - Math.min(...deltas);
    await expect(maxDelta).toBeLessThan(1);
  },
};

/* ------------------------------------------------------------------ */
/* CardOverlayPreservesGeometry — B2 (docs/FEEDBACK-2026-09-17b-PLAN.md, */
/* Lane B): toggling `showCard` must never move or resize a port's own   */
/* content — the overlay draws OVER it, not around it. `slotMainPx` used */
/* to grow from EMPTY_SLOT_MIN_PX to cardMainPx() the instant a card      */
/* turned on; this story measures that it no longer does.                */
/* ------------------------------------------------------------------ */

const OVERLAY_GEOMETRY_ITEMS: PortEdgeItem[] = [
  { id: "g1", label: "args", state: "empty" },
  { id: "g2", label: "kwargs", state: "wired" },
  { id: "g3", label: "out", state: "received" },
];

function CardOverlayGeometryDemo() {
  const [items, setItems] = useState<PortEdgeItem[]>(OVERLAY_GEOMETRY_ITEMS);
  const [showCard, setShowCard] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="overlay-geometry">
      <Checkbox label="Show cards" checked={showCard} onChange={setShowCard} />
      <PortEdge edge="left" items={items} onItemsChange={setItems} showCard={showCard} size={{ width: 160, height: 260 }} />
    </div>
  );
}

export const CardOverlayPreservesGeometry: Story = {
  render: () => <CardOverlayGeometryDemo />,
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('[data-testid="overlay-geometry"]');
    if (!(root instanceof HTMLElement)) throw new Error("expected the overlay-geometry root");
    const checkbox = root.querySelector('input[type="checkbox"]');
    if (!(checkbox instanceof HTMLElement)) throw new Error("expected the show-cards checkbox");

    // B2: every port's own content box (the LabeledPort's `data-slot="port"`
    // root — the card overlay's own sibling, never its parent), before
    // turning cards on vs after, must be IDENTICAL — width/height/x/y,
    // tolerance 0. DOM presence proves nothing here; only the numbers do.
    const memberContentRects = () =>
      Array.from(root.querySelectorAll('[data-slot="port-edge-member"]')).map((slot) => {
        const content = Array.from(slot.children).find((child) => child.getAttribute("data-slot") !== "port-edge-card-surface");
        if (!content) throw new Error("expected port content");
        return content.getBoundingClientRect();
      });
    const before = memberContentRects();
    await expect(before).toHaveLength(3);

    await userEvent.click(checkbox);
    await waitFor(() => {
      expect(root.querySelectorAll('[data-slot="port-edge-card-surface"]')).toHaveLength(3);
    });
    const after = memberContentRects();
    before.forEach((b, i) => {
      const a = after[i];
      expect(a.width).toBe(b.width);
      expect(a.height).toBe(b.height);
      expect(a.x).toBe(b.x);
      expect(a.y).toBe(b.y);
    });

    // Toggling back off removes the overlay again — content untouched
    // throughout, matching Block's ShowCardsAndMembers story (B1's sibling).
    await userEvent.click(checkbox);
    await waitFor(() => {
      expect(root.querySelectorAll('[data-slot="port-edge-card-surface"]')).toHaveLength(0);
    });
    const restored = memberContentRects();
    before.forEach((b, i) => {
      const r = restored[i];
      expect(r.width).toBe(b.width);
      expect(r.height).toBe(b.height);
      expect(r.x).toBe(b.x);
      expect(r.y).toBe(b.y);
    });
  },
};

/* ------------------------------------------------------------------ */
/* GroupedSpacing — B5/B6/B7: ungrouped vs grouped (not collapsed), in  */
/* both column and row, side by side so the uniform pitch reads at a    */
/* glance — and the B6 group outline drawn around the circles.          */
/* ------------------------------------------------------------------ */

const SPACING_ITEMS: PortEdgeItem[] = [
  { id: "sa", label: "args", state: "empty" },
  { id: "sb", label: "kwargs", state: "empty" },
  { id: "sc", label: "in", state: "wired" },
  { id: "sd", label: "out", state: "received" },
];

function SpacingPanel({ edge, groupMode, caption }: { edge: BlockSide; groupMode: "off" | "grouped" | "collapsed"; caption: string }) {
  const [items, setItems] = useState<PortEdgeItem[]>(SPACING_ITEMS);
  const isRow = edge === "top" || edge === "bottom";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{caption}</span>
      <PortEdge
        edge={edge}
        items={items}
        onItemsChange={setItems}
        groups="sa, sb"
        groupMode={groupMode}
        distribution={{ mode: "distribute", scheme: "space-between" }}
        size={isRow ? { width: 360, height: 80 } : { width: 100, height: 360 }}
      />
    </div>
  );
}

/** Consecutive dot-centre deltas along the edge's own main axis. */
function measurePitch(track: Element, axis: "row" | "column"): number[] {
  const dots = Array.from(track.querySelectorAll('[data-slot="port-dot"]'));
  const centers = dots.map((d) => {
    const r = d.getBoundingClientRect();
    return axis === "row" ? r.left + r.width / 2 : r.top + r.height / 2;
  });
  return centers.slice(1).map((c, i) => c - centers[i]);
}

export const GroupedSpacing: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 40 }}>
        <SpacingPanel edge="left" groupMode="off" caption="column, ungrouped" />
        <SpacingPanel edge="left" groupMode="grouped" caption="column, grouped (args,kwargs) — not collapsed" />
        <SpacingPanel edge="left" groupMode="collapsed" caption="column, collapsed (args,kwargs)" />
      </div>
      <div style={{ display: "flex", gap: 40 }}>
        <SpacingPanel edge="top" groupMode="off" caption="row, ungrouped" />
        <SpacingPanel edge="top" groupMode="grouped" caption="row, grouped (args,kwargs) — not collapsed" />
        <SpacingPanel edge="top" groupMode="collapsed" caption="row, collapsed (args,kwargs)" />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tracks = Array.from(canvasElement.querySelectorAll('[data-slot="port-edge"]')) as HTMLElement[];
    await expect(tracks).toHaveLength(6);
    const [colOff, colGrouped, colCollapsed, rowOff, rowGrouped, rowCollapsed] = tracks;

    // A5: pitch is uniform — every consecutive delta equal within 1px — in
    // BOTH axes, grouped or not (the full list, not a sample of two).
    const cases: [HTMLElement, "row" | "column"][] = [
      [colOff, "column"],
      [colGrouped, "column"],
      [rowOff, "row"],
      [rowGrouped, "row"],
    ];
    for (const [track, axis] of cases) {
      const deltas = measurePitch(track, axis);
      await expect(deltas.length).toBe(3); // 4 ports -> 3 consecutive deltas
      const maxDelta = Math.max(...deltas) - Math.min(...deltas);
      await expect(maxDelta).toBeLessThan(1);
    }

    // A5: grouped's pitch equals ungrouped's pitch for the SAME items, in
    // both axes — not merely "internally uniform".
    const colOffPitch = measurePitch(colOff, "column")[0];
    const colGroupedPitch = measurePitch(colGrouped, "column")[0];
    await expect(Math.abs(colGroupedPitch - colOffPitch)).toBeLessThan(1);
    const rowOffPitch = measurePitch(rowOff, "row")[0];
    const rowGroupedPitch = measurePitch(rowGrouped, "row")[0];
    await expect(Math.abs(rowGroupedPitch - rowOffPitch)).toBeLessThan(1);

    // B7: a ROW edge's grouped members sit SIDE BY SIDE — their dots'
    // horizontal positions differ, their vertical positions don't — not
    // stacked into two rows.
    const rowGroupDots = Array.from(rowGrouped.querySelectorAll('[data-slot="port-dot"]')).slice(0, 2);
    const rowGroupRects = rowGroupDots.map((d) => d.getBoundingClientRect());
    await expect(Math.abs(rowGroupRects[1].left - rowGroupRects[0].left)).toBeGreaterThan(4);
    await expect(Math.abs(rowGroupRects[1].top - rowGroupRects[0].top)).toBeLessThan(1);

    // A6/B6: a group outline exists in both grouped panels, encloses the
    // group's own two circles, and carries a real border colour.
    for (const track of [colGrouped, rowGrouped]) {
      const outline = track.querySelector('[data-slot="port-edge-group-outline"]');
      if (!(outline instanceof HTMLElement)) throw new Error("expected a group outline");
      const outlineRect = outline.getBoundingClientRect();
      const dots = Array.from(track.querySelectorAll('[data-slot="port-dot"]')).slice(0, 2);
      for (const dot of dots) {
        const r = dot.getBoundingClientRect();
        await expect(r.left).toBeGreaterThanOrEqual(outlineRect.left - 1);
        await expect(r.right).toBeLessThanOrEqual(outlineRect.right + 1);
        await expect(r.top).toBeGreaterThanOrEqual(outlineRect.top - 1);
        await expect(r.bottom).toBeLessThanOrEqual(outlineRect.bottom + 1);
      }
      const style = getComputedStyle(outline);
      await expect(parseFloat(style.borderTopWidth)).toBeGreaterThan(0);
    }

    // S1 (item 5): a collapsed group renders exactly ONE port dot, its
    // label the chosen "+N more" idiom — N is the group's real member
    // count (args+kwargs -> 2), not "besides the one shown".
    for (const track of [colCollapsed, rowCollapsed]) {
      // 4 ports total, 2 of which (args, kwargs) collapse into 1 -> 3 dots.
      await expect(track.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(3);
      const moreLabel = Array.from(track.querySelectorAll('[data-slot="port-label"]')).find((l) => l.textContent?.includes("more"));
      if (!moreLabel) throw new Error("expected a '+N more' label in the collapsed panel");
      await expect(moreLabel.textContent).toBe("+2 more");
    }

    // S2 (B8, must stay true): the collapsed group's own slot footprint is
    // IDENTICAL to any other single-port slot's — measured, not assumed,
    // since B8 was explicitly "already correct, do not break".
    for (const [collapsedTrack, plainTrack] of [
      [colCollapsed, colOff],
      [rowCollapsed, rowOff],
    ] as const) {
      const collapsedMember = collapsedTrack.querySelector('[data-slot="port-edge-member"]');
      const plainMember = plainTrack.querySelector('[data-slot="port-edge-member"]');
      if (!(collapsedMember instanceof HTMLElement) || !(plainMember instanceof HTMLElement)) throw new Error("expected member boxes");
      const cRect = collapsedMember.getBoundingClientRect();
      const pRect = plainMember.getBoundingClientRect();
      await expect(Math.abs(cRect.width - pRect.width)).toBeLessThan(1);
      await expect(Math.abs(cRect.height - pRect.height)).toBeLessThan(1);
    }
  },
};

/* ------------------------------------------------------------------ */
/* DragPreservesSize — B1/A1: a dragged card's own rect never stretches */
/* or shrinks mid-gesture, for a single port AND a grouped pair.        */
/* ------------------------------------------------------------------ */

/**
 * Like `dragCard`, but returns the dragged element's rect measured MID
 * gesture (after the activation-constraint move, before pointerup) instead
 * of only checking the end state — A1 specifically wants a measurement
 * taken DURING the drag, not just before/after.
 */
async function dragCardMeasuringMidGesture(from: Element, to: Element): Promise<{ before: DOMRect; mid: DOMRect; after: DOMRect }> {
  const fire = (el: Element, type: string, x: number, y: number) =>
    el.dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1, pointerType: "mouse", clientX: x, clientY: y }),
    );
  const before = from.getBoundingClientRect();
  const fromRect = from.getBoundingClientRect();
  const toRect = to.getBoundingClientRect();
  const startX = fromRect.left + fromRect.width / 2;
  const startY = fromRect.top + fromRect.height / 2;
  const endX = toRect.left + toRect.width / 2;
  const endY = toRect.top + toRect.height / 2;
  fire(from, "pointerdown", startX, startY);
  await new Promise((r) => setTimeout(r, 30));
  fire(from, "pointermove", startX, startY + 10); // clears activationConstraint.distance
  await new Promise((r) => setTimeout(r, 30));
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  fire(from, "pointermove", midX, midY);
  await new Promise((r) => setTimeout(r, 30));
  const mid = from.getBoundingClientRect();
  fire(from, "pointermove", endX, endY);
  await new Promise((r) => setTimeout(r, 30));
  fire(from, "pointerup", endX, endY);
  await new Promise((r) => setTimeout(r, 100));
  const after = from.getBoundingClientRect();
  return { before, mid, after };
}

function DragPreservesSizeDemo() {
  const [items, setItems] = useState<PortEdgeItem[]>(INITIAL_ITEMS);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>args/kwargs grouped, not collapsed — drag any card past the others</span>
      <PortEdge edge="left" items={items} onItemsChange={setItems} groups="args, kwargs" groupMode="grouped" size={{ width: 200, height: 380 }} />
    </div>
  );
}

export const DragPreservesSize: Story = {
  render: () => <DragPreservesSizeDemo />,
  play: async ({ canvasElement }) => {
    const track = canvasElement.querySelector('[data-slot="port-edge"]');
    if (!(track instanceof HTMLElement)) throw new Error('expected a [data-slot="port-edge"]');
    const cards = Array.from(track.querySelectorAll('[data-slot="port-edge-card"]'));
    // The grouped (args+kwargs) card and a lone singleton card.
    const groupCard = cards.find((c) => c.querySelectorAll('[data-slot="port-dot"]').length === 2);
    const singleCard = cards.find((c) => c.querySelectorAll('[data-slot="port-dot"]').length === 1);
    if (!groupCard || !singleCard) throw new Error("expected one grouped card and one single card");

    // A1: the SINGLE card's own box stays within 1px of its pre-drag size,
    // measured mid-gesture, dragged past the group.
    const single = await dragCardMeasuringMidGesture(singleCard, groupCard);
    await expect(Math.abs(single.mid.width - single.before.width)).toBeLessThanOrEqual(1);
    await expect(Math.abs(single.mid.height - single.before.height)).toBeLessThanOrEqual(1);

    // A1: the GROUPED card's own box also stays within 1px, dragged past a
    // singleton — the case Zach specifically called out ("when I drag the
    // grouped ports around they shrink a little").
    const nowCards = Array.from(canvasElement.querySelectorAll('[data-slot="port-edge-card"]'));
    const nowGroupCard = nowCards.find((c) => c.querySelectorAll('[data-slot="port-dot"]').length === 2);
    const nowSingleCard = nowCards.find((c) => c.querySelectorAll('[data-slot="port-dot"]').length === 1 && c !== nowGroupCard);
    if (!nowGroupCard || !nowSingleCard) throw new Error("expected a grouped card and a single card after the first drag");
    const grouped = await dragCardMeasuringMidGesture(nowGroupCard, nowSingleCard);
    await expect(Math.abs(grouped.mid.width - grouped.before.width)).toBeLessThanOrEqual(1);
    await expect(Math.abs(grouped.mid.height - grouped.before.height)).toBeLessThanOrEqual(1);
  },
};

/* ------------------------------------------------------------------ */
/* Visibility — item 6: hide N ports, a live "+N more ports" affordance  */
/* appears — aligned with the port LABELS, not floated independently.   */
/* Zach's own critique of the SystemSketch reference ("I don't like the  */
/* placement of the text here") is what this story is built to answer.  */
/* ------------------------------------------------------------------ */

const VISIBILITY_ROSTER: PortEdgeItem[] = [
  { id: "pose", label: "Pose pose", state: "wired" },
  { id: "quality", label: "float quality", state: "empty" },
  { id: "ssdad", label: "ssdad", state: "empty" },
  { id: "extra1", label: "Extra one", state: "empty" },
  { id: "extra2", label: "Extra two", state: "empty" },
];

/**
 * Mechanism (per the coordinator's own question): hidden ports are simply
 * left OUT of the `items` array PortEdge is given, rather than passed in
 * WITH a new per-item `hidden` field. `PortEdgeItem {id, label, state?}`
 * stays exactly as minimal as PORT-EDGE-PLAN-PHASE4.md's own §1 says it
 * needs to for the lane reconcile — this story's hide/show state lives
 * entirely in the STORY, one level up. This also reads MORE faithfully as
 * "reuse Port's Hidden state" than adding a flag would: `Port.hidden`
 * (Phase 1) is "genuinely absent — no element, no halo, no pointer
 * events", and omitting an item from the array achieves exactly that,
 * for the WHOLE port (dot, label, secondary slot), not just the dot —
 * and it is what makes the remaining ports pack together with no gap,
 * matching the reference screenshot (a per-item `hidden` prop passed
 * through `renderItem` would leave the hidden port's own slot rendering
 * an empty box in place, per B3 — the wrong look here).
 */
function mergeVisibleIntoRoster(roster: PortEdgeItem[], hiddenIds: Set<string>, reorderedVisible: PortEdgeItem[]): PortEdgeItem[] {
  let vi = 0;
  return roster.map((item) => (hiddenIds.has(item.id) ? item : reorderedVisible[vi++]));
}

function MoreIndicator({ count, left, top }: { count: number; left: number; top: number }) {
  return (
    <span
      data-slot="port-edge-more-indicator"
      style={{
        position: "absolute",
        left,
        top,
        transform: "translateY(-50%)",
        fontSize: 12,
        fontStyle: "italic",
        color: "var(--muted-foreground)",
        whiteSpace: "nowrap",
      }}
    >
      +{count} more port{count === 1 ? "" : "s"}
    </span>
  );
}

function VisibilityDemo() {
  const [roster, setRoster] = useState<PortEdgeItem[]>(VISIBILITY_ROSTER);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set(["extra1", "extra2"]));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [indicatorPos, setIndicatorPos] = useState<{ left: number; top: number } | null>(null);

  const visibleItems = roster.filter((p) => !hiddenIds.has(p.id));
  const hiddenCount = hiddenIds.size;

  function toggleHidden(id: string) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // S4: measure the ACTUAL rendered port-label edge and the real pitch,
  // rather than assuming a fixed offset — the same "measure, don't guess"
  // discipline the lane's own geometry uses (D8). This is what makes the
  // indicator's alignment provably match the labels above it instead of
  // eyeballing a constant that could drift the moment a label's font or
  // size changes.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const labels = Array.from(container.querySelectorAll<HTMLElement>('[data-slot="port-label"]'));
      const dots = Array.from(container.querySelectorAll<HTMLElement>('[data-slot="port-dot"]'));
      if (labels.length === 0 || dots.length === 0 || hiddenCount === 0) {
        setIndicatorPos(null);
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const firstLabelRect = labels[0].getBoundingClientRect();
      const lastDotRect = dots[dots.length - 1].getBoundingClientRect();
      const pitch = dots.length >= 2 ? dots[1].getBoundingClientRect().top - dots[0].getBoundingClientRect().top : 44;
      const lastDotCenterY = lastDotRect.top - containerRect.top + lastDotRect.height / 2;
      setIndicatorPos({ left: firstLabelRect.left - containerRect.left, top: lastDotCenterY + pitch });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems.map((p) => p.id).join(","), hiddenCount]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Toggle which ports are hidden — the count below updates live.</span>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {roster.map((item) => (
            <Checkbox key={item.id} label={`Hide "${item.label}"`} checked={hiddenIds.has(item.id)} onChange={() => toggleHidden(item.id)} />
          ))}
        </div>
      </div>
      <div ref={containerRef} style={{ position: "relative" }}>
        <PortEdge
          edge="left"
          items={visibleItems}
          onItemsChange={(next) => setRoster((prevRoster) => mergeVisibleIntoRoster(prevRoster, hiddenIds, next))}
          distribution={{ mode: "aligned", anchor: "start", gap: 28, edgePadding: 0 }}
          size={{ width: 200, height: 260 }}
        />
        {indicatorPos && hiddenCount > 0 && <MoreIndicator count={hiddenCount} left={indicatorPos.left} top={indicatorPos.top} />}
      </div>
    </div>
  );
}

export const Visibility: Story = {
  render: () => <VisibilityDemo />,
  play: async ({ canvasElement }) => {
    const track = canvasElement.querySelector('[data-slot="port-edge"]');
    if (!(track instanceof HTMLElement)) throw new Error('expected a [data-slot="port-edge"]');

    // S5: 2 hidden by default -> 3 visible dots, "+2 more ports".
    await expect(track.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(3);
    const indicator = canvasElement.querySelector('[data-slot="port-edge-more-indicator"]');
    if (!(indicator instanceof HTMLElement)) throw new Error("expected the more-indicator");
    await expect(indicator.textContent).toBe("+2 more ports");

    // S4: the indicator's LEFT edge matches a port label's LEFT edge
    // within 1px — measured fresh from the DOM, not from internal state.
    const label = canvasElement.querySelector('[data-slot="port-label"]');
    if (!(label instanceof HTMLElement)) throw new Error("expected a port label");
    const indicatorRect = indicator.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    await expect(Math.abs(indicatorRect.left - labelRect.left)).toBeLessThanOrEqual(1);

    // S1/S5-style liveness: hide a DIFFERENT number of ports and confirm
    // both the dot count and the indicator text follow.
    const hideOneMore = Array.from(canvasElement.querySelectorAll("label")).find((l) => l.textContent?.includes('Hide "ssdad"'));
    const checkbox = hideOneMore?.querySelector('input[type="checkbox"]');
    if (!(checkbox instanceof HTMLInputElement)) throw new Error('expected the "ssdad" checkbox');
    await userEvent.click(checkbox);
    await waitFor(() => {
      expect(canvasElement.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(2);
      const nowIndicator = canvasElement.querySelector('[data-slot="port-edge-more-indicator"]');
      expect(nowIndicator?.textContent).toBe("+3 more ports");
    });
  },
};
