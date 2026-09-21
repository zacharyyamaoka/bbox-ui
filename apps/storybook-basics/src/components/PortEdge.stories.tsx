import { Profiler, useEffect, useLayoutEffect, useRef, useState, type ProfilerOnRenderCallback } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { useDndContext, type DragEndEvent, type DragOverEvent } from "@dnd-kit/core";
import { python } from "@codemirror/lang-python";

import { Block } from "./block";
import { PortEdge, PortEdgeDndProvider, type PortEdgeItem } from "./portEdge";
import { CONTAINER_PADDING, SPACING_SCHEMES, DEFAULT_ALIGN_GAP, defaultDistributionForEdges, type Distribution, type Size } from "./portEdge.layout";
import type { BlockSide, PortTextLayout } from "./port.layout";

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

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
  tags: ["area:ports", "lane:baseline"],
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
  // F-1 (docs/FEEDBACK-2026-09-17c-PLAN.md, superseding Phase 4's original
  // shape): `editing` now ARMS click-to-edit on every port, rather than
  // showing a rail-wide editor by itself — see `PortEdgeProps.editing`'s own
  // doc in portEdge.tsx for the full redesign and the reported capability
  // gap (the old multi-line paste/reorder lane has no trigger any more).
  const [editing, setEditing] = useState(false);
  const [pythonSyntax, setPythonSyntax] = useState(true);

  const edge: BlockSide = orientation === "column" ? "left" : "top";
  const textLayout: PortTextLayout = orientation === "column" ? (labelOffset ? (labelSide === "right" ? "rightOffset" : "leftOffset") : labelSide) : labelRowSide;

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
        <Checkbox label="Show dnd-kit card" checked={showCard} onChange={setShowCard} />
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
        {/* F-1: no `lane.available` gate any more — arming per-port
         *  click-to-edit has none of the old multi-line lane's geometry
         *  requirements (vertical edge, auto mode, no collapsed group), so
         *  the toggle stays enabled on every orientation/mode/groupMode. */}
        <button
          type="button"
          data-testid="lane-toggle"
          onClick={() => setEditing((v) => !v)}
          style={{
            padding: "4px 10px",
            fontSize: 12,
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: editing ? "var(--accent)" : "transparent",
            color: "var(--foreground)",
            cursor: "pointer",
          }}
        >
          {editing ? "Disable label editing" : "Enable label editing"}
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

    // F-1 (docs/FEEDBACK-2026-09-17c-PLAN.md): "I like the toggle but the
    // actual ports should basically look identical. The only difference is
    // when you click the port to edit it." — the toggle ARMS click-to-edit;
    // it must not, by itself, paint anything.
    const editToggle = canvasElement.querySelector('[data-testid="lane-toggle"]');
    if (!(editToggle instanceof HTMLButtonElement)) throw new Error("expected the editing toggle button");

    const rectOf = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    const restingLabels = Array.from(canvasElement.querySelectorAll('[data-slot="port-label-display"]'));
    const restingText = restingLabels.map((el) => el.textContent);
    const restingRects = restingLabels.map(rectOf);

    // F1a: resting state is identical with the toggle off vs on, nothing
    // clicked — same rects, same text, measured, not eyeballed.
    await userEvent.click(editToggle);
    await waitFor(() => {
      const nowLabels = Array.from(canvasElement.querySelectorAll('[data-slot="port-label-display"]'));
      expect(nowLabels.map((el) => el.textContent)).toEqual(restingText);
      expect(nowLabels.map(rectOf)).toEqual(restingRects);
    });

    // F1b: arming alone mounts no floating editor over the rail — the old
    // bug (152404.png) was exactly a `PortLaneOverlay` painted the instant
    // the toggle flipped, with every label hidden under it.
    expect(canvasElement.querySelector('[data-slot="port-edge-lane"]')).toBeNull();
    expect(canvasElement.querySelector('[data-slot="code-editor"]')).toBeNull();

    // F1c/F1d/F1e: click ONE port's label (index 2, "in" — not first or
    // last, so a neighbour on both sides is in scope to prove untouched).
    const targetIndex = 2;
    const armedLabels = Array.from(canvasElement.querySelectorAll('[data-slot="port-label-display"]'));
    const target = armedLabels[targetIndex];
    if (!target) throw new Error("expected a port label to click");
    const otherTextBefore = restingText.filter((_, i) => i !== targetIndex);
    const otherRectsBefore = restingRects.filter((_, i) => i !== targetIndex);
    const targetCardBefore = track.querySelectorAll('[data-slot="port-edge-card"]')[targetIndex];

    await userEvent.click(target);

    // F1c: exactly one CodeEditor mounts — this port's own, not a rail-wide
    // one, and not one per port either.
    await waitFor(() => {
      expect(canvasElement.querySelectorAll('[data-slot="code-editor"]')).toHaveLength(1);
    });

    // F1d: the edited port's own display text is gone from the DOM while
    // editing — not merely covered. One fewer `port-label-display` span,
    // and the other 7 are untouched (rects and text).
    const duringLabels = Array.from(canvasElement.querySelectorAll('[data-slot="port-label-display"]'));
    expect(duringLabels).toHaveLength(restingLabels.length - 1);
    expect(duringLabels.map((el) => el.textContent)).toEqual(otherTextBefore);
    expect(duringLabels.map(rectOf)).toEqual(otherRectsBefore);

    // Type a rename and commit with Enter — the single-line editor's own
    // exit path (labeledPort.tsx's `DefaultPortLabel`).
    const editorContent = await waitFor(() => {
      const el = canvasElement.querySelector('[data-slot="code-editor"] .cm-content');
      if (!(el instanceof HTMLElement)) throw new Error("expected the port's own single-line editor");
      return el;
    });
    await userEvent.click(editorContent);
    await userEvent.keyboard("{Control>}{a}{/Control}renamed");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => {
      expect(canvasElement.querySelectorAll('[data-slot="code-editor"]')).toHaveLength(0);
    });

    // F1d (return half): the display text is back, now the committed value.
    const afterLabels = Array.from(canvasElement.querySelectorAll('[data-slot="port-label-display"]'));
    expect(afterLabels).toHaveLength(restingLabels.length);
    expect(afterLabels[targetIndex]?.textContent).toBe("renamed");

    // F1e: the port's own id survived the rename — proven by DOM identity,
    // not by re-reading the label. `portEdge.tsx`'s `handlePortLabelWrite`
    // matches the existing item by id and replaces only its `label`; React's
    // `key={m.id}` on the card means the SAME element only survives a
    // re-render when its id did not change. A minted id (the old lane's
    // `reconcilePortLane` path) would have unmounted this node and mounted a
    // new one in its place.
    const targetCardAfter = track.querySelectorAll('[data-slot="port-edge-card"]')[targetIndex];
    expect(targetCardAfter).toBe(targetCardBefore);

    // Still no floating overlay at any point in this flow.
    expect(canvasElement.querySelector('[data-slot="port-edge-lane"]')).toBeNull();

    // The old multi-line lane's own row/column restriction is gone along
    // with its only trigger — per-port editing has no axis requirement.
    // Prove it rather than assume it: arm on a Row edge and click a label.
    const rowBtn = Array.from(canvasElement.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Row");
    if (!rowBtn) throw new Error("expected the Row button");
    await userEvent.click(rowBtn);
    await waitFor(() => expect(canvasElement.querySelector('[data-slot="port-edge"][data-edge="top"]')).not.toBeNull());
    const rowLabel = canvasElement.querySelector('[data-slot="port-label-display"]');
    if (!(rowLabel instanceof HTMLElement)) throw new Error("expected a port label on the row edge");
    await userEvent.click(rowLabel);
    await waitFor(() => {
      expect(canvasElement.querySelectorAll('[data-slot="code-editor"]')).toHaveLength(1);
    });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(canvasElement.querySelectorAll('[data-slot="code-editor"]')).toHaveLength(0);
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
      <Checkbox label="Show dnd-kit card" checked={showCard} onChange={setShowCard} />
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
/* DndKitCollisionRects — 2026-09-17, Lane I: "what does dnd-kit         */
/* actually use for a grouped family... the goal with showing the cards */
/* is to show what dnd is using for like the collision calculations."   */
/* Read straight off dnd-kit's OWN registry (`useDndContext()`), mid-    */
/* drag — not inferred from the DOM, not guessed. See the final report  */
/* for the finding this settles.                                        */
/* ------------------------------------------------------------------ */

/**
 * `useDndContext().droppableRects` is a live `Map<id, ClientRect>` dnd-kit
 * itself measures — but ONLY while a drag is active (`MeasuringStrategy.
 * WhileDragging`, the default: `disabled && !dragging` short-circuits to an
 * empty map otherwise). A plain child of `PortEdgeDndProvider`'s own
 * `DndContext` can read it directly; no instrumentation of `portEdge.tsx`
 * itself is needed; `PortEdgeDndProvider` is already exported for exactly
 * this kind of multi-edge / shared-context composition (`LeftAndRight`,
 * `AroundABox`).
 */
let lastDroppableRects: Map<string, { top: number; left: number; width: number; height: number }> | null = null;

function DndRectsProbe() {
  const { active, droppableRects } = useDndContext();
  useEffect(() => {
    if (!active) return;
    lastDroppableRects = new Map(
      Array.from(droppableRects.entries()).map(([id, rect]) => [String(id), { top: rect.top, left: rect.left, width: rect.width, height: rect.height }]),
    );
  }, [active, droppableRects]);
  return null;
}

const COLLISION_ITEMS: PortEdgeItem[] = [
  { id: "ra", label: "args", state: "empty" },
  { id: "rb", label: "kwargs", state: "empty" },
  { id: "rc", label: "solo", state: "empty" },
];

function DndKitCollisionRectsDemo() {
  const [items, setItems] = useState<PortEdgeItem[]>(COLLISION_ITEMS);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
        args/kwargs grouped (not collapsed), solo ungrouped — drag any card to populate dnd-kit's own `droppableRects`
      </span>
      <PortEdgeDndProvider>
        <PortEdge edge="left" items={items} onItemsChange={setItems} groups="ra, rb" groupMode="grouped" size={{ width: 200, height: 300 }} />
        <DndRectsProbe />
      </PortEdgeDndProvider>
    </div>
  );
}

/** Same synthetic-drag technique as `dragCard`, but stops MID gesture
 *  (after clearing the activation distance, before pointerup) so
 *  `droppableRects` is captured while `active` is actually set, then
 *  releases — a completed drag would work too, but a still-active one is
 *  the more direct read. */
async function dragMidGestureAndRelease(card: Element): Promise<void> {
  const fire = (type: string, x: number, y: number) =>
    card.dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1, pointerType: "mouse", clientX: x, clientY: y }),
    );
  const r = card.getBoundingClientRect();
  const startX = r.left + r.width / 2;
  const startY = r.top + r.height / 2;
  fire("pointerdown", startX, startY);
  await new Promise((res) => setTimeout(res, 30));
  fire("pointermove", startX, startY + 10); // clears activationConstraint.distance -> active gets set
  await new Promise((res) => setTimeout(res, 60));
  fire("pointerup", startX, startY + 10);
  await new Promise((res) => setTimeout(res, 60));
}

export const DndKitCollisionRects: Story = {
  render: () => <DndKitCollisionRectsDemo />,
  play: async ({ canvasElement }) => {
    lastDroppableRects = null;
    const track = canvasElement.querySelector('[data-slot="port-edge"]');
    if (!(track instanceof HTMLElement)) throw new Error('expected a [data-slot="port-edge"]');
    const cards = Array.from(track.querySelectorAll('[data-slot="port-edge-card"]'));
    await expect(cards).toHaveLength(2); // 2 SLOTS: the (ra,rb) group + the solo "rc" — never 3.
    const groupCard = cards.find((c) => c.querySelectorAll('[data-slot="port-dot"]').length === 2);
    if (!groupCard) throw new Error("expected the grouped slot's own card wrapper");

    await dragMidGestureAndRelease(groupCard);
    await waitFor(() => expect(lastDroppableRects).not.toBeNull());
    const rects = lastDroppableRects!;

    // THE FINDING: exactly as many droppable rects as SLOTS (2), never as
    // many as raw ports (3) — dnd-kit's own registry, not the DOM, proves a
    // grouped-not-collapsed family collides as ONE rectangle, because it is
    // registered as one `useSortable({id: slot.slotId})`, not one per member.
    // dnd-kit registers THREE droppables total here, not two: the whole
    // TRACK (`PortEdgeBody`'s own `useDroppable({id: containerId})`, id
    // `"left"` — this edge's `id`) PLUS one per SLOT (`useSortable` inside
    // `SortableSlotCard`). Measured live: `{"g0": h=146, "rc": h=24, "left":
    // h=300}` — the track-level entry is a coarse whole-edge drop target,
    // unrelated to which PORTS are grouped, so the question this story
    // actually answers — "one rect per family, or one per member?" — is
    // decided by the SLOT-level entries alone. Filtering the track's own id
    // out is what makes that comparison honest.
    const slotRects = new Map(Array.from(rects.entries()).filter(([id]) => id !== "left"));
    await expect(slotRects.size).toBe(2); // 2 SLOTS (the group + the solo) — never 3 (the raw port count).

    const memberRects = Array.from(track.querySelectorAll('[data-slot="port-edge-member"]')).map((m) => m.getBoundingClientRect());
    await expect(memberRects).toHaveLength(3); // 3 rendered PORT boxes...
    // ...but no SLOT-level id names an individual grouped member — dnd-kit
    // never registered "ra" or "rb" on their own, only their group's slotId.
    await expect(slotRects.has("ra")).toBe(false);
    await expect(slotRects.has("rb")).toBe(false);

    // The group's own registered rect is WIDER than a single member box
    // (slotMainPx=24) — it encloses BOTH members, not one of them.
    const groupSlotId = Array.from(slotRects.keys()).find((id) => id !== "rc");
    if (!groupSlotId) throw new Error("expected a group slot id in droppableRects");
    const groupRect = slotRects.get(groupSlotId)!;
    await expect(groupRect.height).toBeGreaterThan(24 * 1.5); // taller than one member's own 24px box.
    // ...and equal to the SAME wrapping div's own live rect — the group's
    // rendered box IS what dnd-kit measured, not a coincidence of numbers.
    const groupCardBox = groupCard.getBoundingClientRect();
    await expect(Math.abs(groupRect.height - groupCardBox.height)).toBeLessThan(1);
    await expect(Math.abs(groupRect.width - groupCardBox.width)).toBeLessThan(1);
  },
};

/* ------------------------------------------------------------------ */
/* GroupedFamilyCard — I3: grouping collapsed vs expanded, the card      */
/* toggle available in BOTH. The overlay drawn is EXACTLY the rect       */
/* `DndKitCollisionRects` (above) measured — one box per SLOT.           */
/* ------------------------------------------------------------------ */

const FAMILY_CARD_ITEMS: PortEdgeItem[] = [
  { id: "fa", label: "args", state: "empty" },
  { id: "fb", label: "kwargs", state: "wired" },
  { id: "fc", label: "solo", state: "received" },
];

function GroupedFamilyPanel({ groupMode, showCard, caption }: { groupMode: "grouped" | "collapsed"; showCard: boolean; caption: string }) {
  const [items, setItems] = useState<PortEdgeItem[]>(FAMILY_CARD_ITEMS);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{caption}</span>
      <PortEdge edge="left" items={items} onItemsChange={setItems} groups="fa, fb" groupMode={groupMode} showCard={showCard} size={{ width: 180, height: 280 }} />
    </div>
  );
}

function GroupedFamilyCardDemo() {
  const [showCard, setShowCard] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Checkbox label="Show dnd-kit card" checked={showCard} onChange={setShowCard} />
      <div style={{ display: "flex", gap: 32 }}>
        <GroupedFamilyPanel groupMode="grouped" showCard={showCard} caption="Grouped — expanded (every member its own dot, one shared card)" />
        <GroupedFamilyPanel groupMode="collapsed" showCard={showCard} caption="Grouped — collapsed (one +N chip, same card idiom)" />
      </div>
    </div>
  );
}

export const GroupedFamilyCard: Story = {
  render: () => <GroupedFamilyCardDemo />,
  play: async ({ canvasElement }) => {
    const tracks = Array.from(canvasElement.querySelectorAll('[data-slot="port-edge"]')) as HTMLElement[];
    await expect(tracks).toHaveLength(2);
    const [expanded, collapsed] = tracks;

    // Card off by default: no surfaces anywhere yet.
    await expect(canvasElement.querySelectorAll('[data-slot="port-edge-card-surface"]')).toHaveLength(0);

    const checkbox = required<HTMLInputElement>(canvasElement, 'input[type="checkbox"]', "the show-dnd-kit-card checkbox");
    await userEvent.click(checkbox);

    // Expanded: TWO real dots (args, kwargs) rendered — but only ONE card
    // surface, drawn once at the GROUP level (portEdge.tsx's `GroupSlotBody`
    // fix), not one per member.
    await waitFor(() => {
      expect(expanded.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(3); // fa, fb, fc all real dots
    });
    const expandedGroup = required<HTMLElement>(expanded, '[data-slot="port-edge-group"]', "the expanded group container");
    await expect(expandedGroup.querySelectorAll('[data-slot="port-edge-card-surface"]')).toHaveLength(1);
    await expect(expandedGroup.querySelectorAll('[data-slot="port-edge-member"] > [data-slot="port-edge-card-surface"]')).toHaveLength(0);
    // That one surface is WIDER than a single 24px member box — "like one
    // larger card", not two small ones with a gap.
    const surfaceRect = required<HTMLElement>(expandedGroup, '[data-slot="port-edge-card-surface"]', "the group's card surface").getBoundingClientRect();
    await expect(surfaceRect.height).toBeGreaterThan(24 * 1.5);

    // Collapsed: ONE dot standing for the whole family, ONE card — the
    // idiom this already had (B8), unchanged by this fix.
    await waitFor(() => {
      expect(collapsed.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(2); // the collapsed chip + solo
    });
    await expect(collapsed.querySelectorAll('[data-slot="port-edge-card-surface"]')).toHaveLength(2); // one per slot, same as expanded's slot count
  },
};

/* ------------------------------------------------------------------ */
/* DragSmoothnessProfile — "the dragging of the grouped ports is not as  */
/* smooth as I would like it to be." A MEASUREMENT, not a guess: React's */
/* own `<Profiler>` records every commit's real render cost while        */
/* dragging a card on an all-singleton edge vs an edge carrying a real   */
/* 3-member group — same 7 raw ports either way, so the only variable is */
/* whether a group is on the track. See the final report for the        */
/* numbers this run produced and the cause they point to.                */
/* ------------------------------------------------------------------ */

const PROFILE_ITEMS_FLAT: PortEdgeItem[] = [
  { id: "f1", label: "args", state: "empty" },
  { id: "f2", label: "kwargs", state: "empty" },
  { id: "f3", label: "extra", state: "empty" },
  { id: "f4", label: "in", state: "wired" },
  { id: "f5", label: "out", state: "received" },
  { id: "f6", label: "cfg", state: "empty" },
  { id: "f7", label: "err", state: "empty" },
];
const PROFILE_ITEMS_GROUPED: PortEdgeItem[] = [
  { id: "g1", label: "args", state: "empty" },
  { id: "g2", label: "kwargs", state: "empty" },
  { id: "g3", label: "extra", state: "empty" },
  { id: "g4", label: "in", state: "wired" },
  { id: "g5", label: "out", state: "received" },
  { id: "g6", label: "cfg", state: "empty" },
  { id: "g7", label: "err", state: "empty" },
];

interface CommitRecord {
  actualDuration: number;
}
// Module-level, reset before each measured drag — `<Profiler>`'s own
// callback has no way to hand data back except a side channel, and this
// story only ever runs one drag at a time (no concurrent profiling).
let profileCommits: CommitRecord[] = [];
const recordCommit: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
  profileCommits.push({ actualDuration });
};

function DragProfileDemo() {
  const [flatItems, setFlatItems] = useState<PortEdgeItem[]>(PROFILE_ITEMS_FLAT);
  const [groupedItems, setGroupedItems] = useState<PortEdgeItem[]>(PROFILE_ITEMS_GROUPED);
  return (
    <div style={{ display: "flex", gap: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>7 ports, no groups — the baseline</span>
        <Profiler id="drag-profile-flat" onRender={recordCommit}>
          <PortEdge edge="left" items={flatItems} onItemsChange={setFlatItems} size={{ width: 180, height: 460 }} />
        </Profiler>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>7 ports, args/kwargs/extra grouped — same raw port count</span>
        <Profiler id="drag-profile-grouped" onRender={recordCommit}>
          <PortEdge edge="left" items={groupedItems} onItemsChange={setGroupedItems} groups="g1, g2, g3" groupMode="grouped" size={{ width: 180, height: 460 }} />
        </Profiler>
      </div>
    </div>
  );
}

function raf(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Real PointerSensor drag, held for `steps` real frames apart (`raf`) —
 *  `dragCard`'s own technique, extended to isolate PER-MOVE commit cost
 *  instead of only the end state. `profileCommits` is cleared right after
 *  activation, so only the steady-state drag frames are counted — not the
 *  one-time activation commit, which both configurations pay identically. */
async function dragAndCollectCommits(card: Element, steps: number): Promise<CommitRecord[]> {
  const fire = (type: string, x: number, y: number) =>
    card.dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1, pointerType: "mouse", clientX: x, clientY: y }),
    );
  const r = card.getBoundingClientRect();
  const startX = r.left + r.width / 2;
  const startY = r.top + r.height / 2;
  fire("pointerdown", startX, startY);
  await raf();
  fire("pointermove", startX, startY + 10); // clears activationConstraint.distance
  await raf();
  profileCommits = [];
  for (let i = 1; i <= steps; i++) {
    fire("pointermove", startX, startY + 10 + i * 4);
    await raf();
  }
  const commits = profileCommits;
  fire("pointerup", startX, startY + 10 + steps * 4);
  await raf();
  return commits;
}

export const DragSmoothnessProfile: Story = {
  render: () => <DragProfileDemo />,
  play: async ({ canvasElement }) => {
    const tracks = Array.from(canvasElement.querySelectorAll('[data-slot="port-edge"]')) as HTMLElement[];
    await expect(tracks).toHaveLength(2);
    const [flatTrack, groupedTrack] = tracks;

    const flatCard = required<HTMLElement>(flatTrack, '[data-slot="port-edge-card"]', "the flat edge's first card");
    const groupedCards = Array.from(groupedTrack.querySelectorAll('[data-slot="port-edge-card"]'));
    const groupCard = groupedCards.find((c) => c.querySelectorAll('[data-slot="port-dot"]').length === 3);
    if (!groupCard) throw new Error("expected the 3-member group's own card wrapper");

    const STEPS = 15;
    const flatCommits = await dragAndCollectCommits(flatCard, STEPS);
    const groupedCommits = await dragAndCollectCommits(groupCard, STEPS);

    const totalMs = (records: CommitRecord[]) => records.reduce((sum, r) => sum + r.actualDuration, 0);
    const flatTotalMs = totalMs(flatCommits);
    const groupedTotalMs = totalMs(groupedCommits);

    const pctDelta = ((groupedTotalMs - flatTotalMs) / flatTotalMs) * 100;
    // The measurement — printed for the report, not gated on a strict
    // wall-clock budget (a hard ms threshold on a shared CI runner is
    // exactly the flaky-gate class this repo's own rules warn against).
    // The real assertion is the structural one below.
    // eslint-disable-next-line no-console
    console.log(
      `[DragSmoothnessProfile] flat(7 singles, 7 slots): ${flatCommits.length} commits / ${flatTotalMs.toFixed(2)}ms total / ${(flatTotalMs / STEPS).toFixed(3)}ms per move` +
        ` · grouped(3+4, 5 slots): ${groupedCommits.length} commits / ${groupedTotalMs.toFixed(2)}ms total / ${(groupedTotalMs / STEPS).toFixed(3)}ms per move` +
        ` · grouped is ${Math.abs(pctDelta).toFixed(0)}% ${pctDelta < 0 ? "CHEAPER" : "more expensive"} in total commit cost (React render, not paint/composite)`,
    );

    // Both drags actually ran and were measured (a zero-commit result would
    // mean the Profiler never fired, which would make the numbers above
    // meaningless rather than merely small).
    await expect(flatCommits.length).toBeGreaterThan(0);
    await expect(groupedCommits.length).toBeGreaterThan(0);

    // React's own render cost is CHEAPER for the grouped edge (fewer top-
    // level sortable SLOTS — 5, vs the flat edge's 7 — means fewer sibling
    // rects `useDerivedTransform` has to re-measure per frame). So the
    // "not as smooth" complaint is not a compute-cost problem. The second,
    // corroborating measurement below tests the other candidate: does
    // reordering PAST a group move an unrelated BYSTANDER card farther than
    // reordering past a single port does — a bigger visual jump per event,
    // even though there are fewer events overall. Re-queried fresh (never
    // by fixed index) because the profiling drags above may themselves have
    // already reordered either track — a real `PointerSensor` drag that
    // crosses a neighbour's midpoint DOES commit a reorder on release.
    //
    // PREDICTION, worked out from `distributionStyle`'s real CSS
    // `justify-content` (portEdge.layout.ts): a bystander's position is the
    // cumulative sum of every PRECEDING slot's own height plus gaps. An
    // ADJACENT swap (index i <-> i+1, what `dragCard` produces here) leaves
    // that sum UNCHANGED for anything after index i+1 — the two swapped
    // slots' combined height is the same regardless of which one comes
    // first — so a bystander at i+2 should measure ~0px of movement for
    // EITHER edge, group or no group. Asserted below, not just logged: a
    // non-zero result here would mean the prediction (and the closed-form
    // gap model `interSlotGapPx` documents) is wrong.
    const siblingShift = (before: DOMRect, after: DOMRect) => Math.hypot(after.left - before.left, after.top - before.top);

    // Flat: drag the FIRST rendered card past the SECOND — measure how far
    // an uninvolved THIRD (bystander) card ends up moving.
    const flatCardsBefore = Array.from(flatTrack.querySelectorAll('[data-slot="port-edge-card"]'));
    if (flatCardsBefore.length < 3) throw new Error("expected at least 3 cards on the flat edge");
    const flatBystanderBefore = flatCardsBefore[2].getBoundingClientRect();
    await dragCard(flatCardsBefore[0], flatCardsBefore[1]);
    await waitFor(() => expect(flatTrack.querySelectorAll('[data-slot="port-edge-card"]')).toHaveLength(7));
    const flatBystanderAfter = flatTrack.querySelectorAll('[data-slot="port-edge-card"]')[2].getBoundingClientRect();
    const flatShift = siblingShift(flatBystanderBefore, flatBystanderAfter);

    // Grouped: drag the GROUP (found by dot count, never by index) past its
    // immediate NEXT sibling in DOM order — measure a bystander two slots
    // away from the group's own starting position.
    const groupedCardsBefore = Array.from(groupedTrack.querySelectorAll('[data-slot="port-edge-card"]'));
    const groupIndexBefore = groupedCardsBefore.findIndex((c) => c.querySelectorAll('[data-slot="port-dot"]').length === 3);
    if (groupIndexBefore === -1 || groupIndexBefore + 2 >= groupedCardsBefore.length) throw new Error("expected the group plus two more slots after it");
    const groupedBystanderBefore = groupedCardsBefore[groupIndexBefore + 2].getBoundingClientRect();
    // Adjacent-index swap (arrayMove(items, i, i+1) on two neighbours) only
    // ever exchanges THOSE two positions — every other index, the
    // bystander's included, keeps its own index across the reorder, so
    // re-reading the same index post-drag is correct here (not an
    // assumption borrowed from the flat case; re-verified for this specific
    // adjacent-swap shape).
    await dragCard(groupedCardsBefore[groupIndexBefore], groupedCardsBefore[groupIndexBefore + 1]);
    await waitFor(() => expect(groupedTrack.querySelectorAll('[data-slot="port-edge-card"]')).toHaveLength(5));
    const groupedBystanderAfter = groupedTrack.querySelectorAll('[data-slot="port-edge-card"]')[groupIndexBefore + 2].getBoundingClientRect();
    const groupedShift = siblingShift(groupedBystanderBefore, groupedBystanderAfter);

    // eslint-disable-next-line no-console
    console.log(
      `[DragSmoothnessProfile] bystander displacement after an adjacent swap — flat: ${flatShift.toFixed(1)}px · grouped: ${groupedShift.toFixed(1)}px` +
        " (both ~0px confirms the prediction above: an adjacent swap's combined height is order-independent, group or not)",
    );
    // Confirmed, not assumed: neither edge moves its bystander meaningfully
    // — "moving a large object among small ones" is NOT what makes an
    // adjacent reorder feel heavier, at least not via this mechanism.
    await expect(flatShift).toBeLessThan(2);
    await expect(groupedShift).toBeLessThan(2);
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

/* ------------------------------------------------------------------ */
/* EdgeDistributionControls — follow-up feedback item 3 (Lane E):        */
/* "the ports on the top and bottom and right edges are not evenly       */
/* spacing correctly... the two ports seem at opposing sides" is exactly */
/* `space-between`'s effect on two items — the DEFAULT this story starts */
/* each panel at, so the bug reproduces before anyone touches a control. */
/* A live, per-edge segmented control (the SAME `DistributionControl`    */
/* `SingleEdge` already uses, just one instance per edge) then switches  */
/* the scheme to "Around" (`space-around`) — his own "Distribute and     */
/* Around" wording — live, in place, on top/bottom/right, matching every */
/* edge his screenshots named. A fifth panel proves the SIBLING default  */
/* (left/right-only populated -> aligned, anchored to start) and the     */
/* sixth pair asserts `defaultDistributionForEdges` itself — the exact   */
/* function `blockPort.tsx` (lane D) is expected to call, so this file   */
/* pins its contract directly rather than only through a consumer.       */
/* ------------------------------------------------------------------ */

function EdgeControlPanel({
  edge,
  items,
  caption,
  testId,
  initial = { mode: "distribute", scheme: "space-between" },
}: {
  edge: BlockSide;
  items: PortEdgeItem[];
  caption: string;
  testId: string;
  initial?: Distribution;
}) {
  const [value, setValue] = useState<PortEdgeItem[]>(items);
  const [distribution, setDistribution] = useState<Distribution>(initial);
  const isRow = edge === "top" || edge === "bottom";
  return (
    <div data-testid={testId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{caption}</span>
      <DistributionControl value={distribution} onChange={setDistribution} />
      <PortEdge edge={edge} items={value} onItemsChange={setValue} distribution={distribution} size={isRow ? { width: 260, height: 80 } : { width: 100, height: 260 }} />
    </div>
  );
}

const twoPorts = (prefix: string): PortEdgeItem[] => [
  { id: `${prefix}-1`, label: "a", state: "empty" },
  { id: `${prefix}-2`, label: "b", state: "wired" },
];
const onePort = (prefix: string): PortEdgeItem[] => [{ id: `${prefix}-1`, label: "solo", state: "empty" }];

function EdgeDistributionControlsDemo() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-start" }}>
      <EdgeControlPanel testId="top-two" edge="top" items={twoPorts("t")} caption='Top · 2 ports — starts "Edge to edge" (his screenshot), switch to "Around"' />
      <EdgeControlPanel testId="bottom-two" edge="bottom" items={twoPorts("b")} caption="Bottom · 2 ports — same control, same fix" />
      <EdgeControlPanel testId="right-two" edge="right" items={twoPorts("r")} caption="Right · 2 ports — same control, same fix" />
      <EdgeControlPanel
        testId="top-one"
        edge="top"
        items={onePort("s")}
        caption='Top · 1 port, "Around" from the start — centred, no n===1 special case in the code'
        initial={{ mode: "distribute", scheme: "space-around" }}
      />
      <EdgeControlPanel
        testId="left-aligned"
        edge="left"
        items={twoPorts("l")}
        caption="Left-only populated (documentation of the sibling default): aligned, anchored to start"
        initial={{ mode: "aligned", anchor: "start", gap: DEFAULT_ALIGN_GAP, edgePadding: 0 }}
      />
    </div>
  );
}

export const EdgeDistributionControls: Story = {
  render: () => <EdgeDistributionControlsDemo />,
  play: async ({ canvasElement }) => {
    const panel = (testId: string) => {
      const el = canvasElement.querySelector(`[data-testid="${testId}"]`);
      if (!(el instanceof HTMLElement)) throw new Error(`expected panel ${testId}`);
      return el;
    };
    const track = (p: HTMLElement) => {
      const t = p.querySelector('[data-slot="port-edge"]');
      if (!(t instanceof HTMLElement)) throw new Error("expected a port-edge track");
      return t;
    };
    const dotCenters = (p: HTMLElement, axis: "row" | "column") =>
      Array.from(p.querySelectorAll('[data-slot="port-dot"]')).map((d) => {
        const r = d.getBoundingClientRect();
        return axis === "row" ? r.left + r.width / 2 : r.top + r.height / 2;
      });
    const clickAround = async (p: HTMLElement) => {
      const btn = Array.from(p.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Around");
      if (!(btn instanceof HTMLButtonElement)) throw new Error('expected an "Around" segmented button');
      await userEvent.click(btn);
    };

    // E3 — Top · 2 ports: the live control measurably MOVES the ports.
    // Captured BEFORE switching (still "Edge to edge" / space-between,
    // his screenshot's own starting point).
    const topTwo = panel("top-two");
    const before = dotCenters(topTwo, "row");
    await expect(before).toHaveLength(2);

    await clickAround(topTwo);
    await waitFor(() => {
      const after = dotCenters(topTwo, "row");
      // Both dots must have actually moved — the control isn't a no-op.
      expect(Math.abs(after[0] - before[0])).toBeGreaterThan(1);
      expect(Math.abs(after[1] - before[1])).toBeGreaterThan(1);
    });

    // E1 — same panel, now on "Around": the two ports sit symmetric about
    // the edge's own centre — |left gap - right gap| < 1px, measured from
    // the TRACK's own box (not the container padding assumed, the real
    // rendered rect).
    const topTwoTrack = track(topTwo);
    const topTwoTrackRect = topTwoTrack.getBoundingClientRect();
    const topTwoAfter = dotCenters(topTwo, "row");
    const topTwoLeftGap = topTwoAfter[0] - topTwoTrackRect.left;
    const topTwoRightGap = topTwoTrackRect.right - topTwoAfter[1];
    await expect(Math.abs(topTwoLeftGap - topTwoRightGap)).toBeLessThan(1);

    // E1 repeated on Bottom and Right — his screenshots named all three.
    for (const testId of ["bottom-two", "right-two"]) {
      const p = panel(testId);
      const axis: "row" | "column" = testId === "right-two" ? "column" : "row";
      const beforeMove = dotCenters(p, axis);
      await clickAround(p);
      await waitFor(() => {
        const afterMove = dotCenters(p, axis);
        expect(Math.abs(afterMove[0] - beforeMove[0])).toBeGreaterThan(1);
      });
      const t = track(p);
      const r = t.getBoundingClientRect();
      const centers = dotCenters(p, axis);
      const leftGap = axis === "row" ? centers[0] - r.left : centers[0] - r.top;
      const rightGap = axis === "row" ? r.right - centers[1] : r.bottom - centers[1];
      await expect(Math.abs(leftGap - rightGap)).toBeLessThan(1);
    }

    // E2 — Top · 1 port, "Around" from the very first render (no click):
    // the single port sits at the track's own centre, ±1px. This is
    // `mainAxisPositions`'s `count === 1` branch under `space-around`
    // exercised directly — proof there is no separate n===1 special case
    // anywhere in `portEdge.tsx`/`portEdge.layout.ts` beyond that one
    // CSS-spec-mandated branch.
    const topOne = panel("top-one");
    const topOneTrack = track(topOne).getBoundingClientRect();
    const topOneDot = topOne.querySelector('[data-slot="port-dot"]');
    if (!(topOneDot instanceof HTMLElement)) throw new Error("expected a single port dot");
    const topOneCenter = topOneDot.getBoundingClientRect();
    const topOneCenterX = topOneCenter.left + topOneCenter.width / 2;
    const trackCenterX = topOneTrack.left + topOneTrack.width / 2;
    await expect(Math.abs(topOneCenterX - trackCenterX)).toBeLessThanOrEqual(1);

    // Sibling default, documented structurally: left-only populated stays
    // aligned/start — both ports render, packed from the column's start.
    const leftAligned = panel("left-aligned");
    await expect(leftAligned.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(2);
    const leftDots = Array.from(leftAligned.querySelectorAll('[data-slot="port-dot"]')).map((d) => d.getBoundingClientRect().top);
    await expect(leftDots[0]).toBeLessThan(leftDots[1]);

    // `defaultDistributionForEdges` — the exact function lane D's
    // `blockPort.tsx` calls — pinned directly, independent of any DOM.
    await expect(defaultDistributionForEdges(true)).toEqual({ mode: "distribute", scheme: "space-around" });
    await expect(defaultDistributionForEdges(false)).toEqual({ mode: "aligned", anchor: "start", gap: DEFAULT_ALIGN_GAP, edgePadding: 0 });
  },
};

/* ------------------------------------------------------------------ */
/* MaxVisible — follow-up feedback items 2/4 (Lane E): "+X more" for a  */
/* capped edge. `PortEdge`'s own `maxVisible` prop now cuts the track    */
/* itself (not a story-local filter, the way the earlier `Visibility`   */
/* story above modelled it) and draws the "+N more" line in the same    */
/* wording the group-collapse chip already uses (`SlotBody`'s "+N more")*/
/* rather than inventing a second phrase for what Zach called "the same */
/* fact". `renderCollapsed` was read first and does not fit — it is     */
/* handed one named group's members, and a `maxVisible` cut has no      */
/* group, just whatever fell after the cutoff (this file's own module   */
/* doc on `PortEdgeProps.maxVisible` says so at the seam itself).        */
/* ------------------------------------------------------------------ */

const MAX_VISIBLE_ROSTER: PortEdgeItem[] = [
  { id: "mv1", label: "args", state: "empty" },
  { id: "mv2", label: "kwargs", state: "wired" },
  { id: "mv3", label: "in", state: "received" },
  { id: "mv4", label: "out", state: "empty" },
  { id: "mv5", label: "cfg", state: "valueSet" },
  { id: "mv6", label: "err", state: "empty" },
];

function MaxVisibleDemo() {
  const [items, setItems] = useState<PortEdgeItem[]>(MAX_VISIBLE_ROSTER);
  const [maxVisible, setMaxVisible] = useState(3);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      <label style={{ fontSize: 11, display: "flex", gap: 6, alignItems: "center" }}>
        maxVisible
        <input
          data-testid="max-visible-input"
          type="number"
          min={0}
          max={items.length}
          value={maxVisible}
          style={{ width: 48 }}
          onChange={(e) => setMaxVisible(Math.max(0, Math.min(items.length, Number(e.target.value) || 0)))}
        />
      </label>
      <PortEdge edge="left" items={items} onItemsChange={setItems} maxVisible={maxVisible} size={{ width: 200, height: 320 }} />
    </div>
  );
}

export const MaxVisible: Story = {
  render: () => <MaxVisibleDemo />,
  play: async ({ canvasElement }) => {
    const track = canvasElement.querySelector('[data-slot="port-edge"]');
    if (!(track instanceof HTMLElement)) throw new Error('expected a [data-slot="port-edge"]');

    // maxVisible=3 of 6 -> 3 dots rendered, "+3 more" (the true hidden
    // count, not merely "a chip exists"). The indicator's own position is
    // measured (a real `useLayoutEffect` + `ResizeObserver`, D8's "measure,
    // don't assume"), so it lands one commit after mount — waited for.
    await expect(track.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(3);
    const indicator = await waitFor(() => {
      const el = track.querySelector('[data-slot="port-edge-more"]');
      if (!(el instanceof HTMLElement)) throw new Error('expected a [data-slot="port-edge-more"] line');
      return el;
    });
    await expect(indicator.textContent).toBe("+3 more");

    // It renders UNDER the last visible port (a column edge: below it, and
    // left-aligned with it), not floating disconnected from the list.
    const members = Array.from(track.querySelectorAll('[data-slot="port-edge-member"]'));
    const lastMember = members[members.length - 1];
    if (!(lastMember instanceof HTMLElement)) throw new Error("expected the last visible port slot");
    const lastRect = lastMember.getBoundingClientRect();
    const indicatorRect = indicator.getBoundingClientRect();
    await expect(indicatorRect.top).toBeGreaterThanOrEqual(lastRect.bottom - 1);
    await expect(Math.abs(indicatorRect.left - lastRect.left)).toBeLessThanOrEqual(2);

    // Live: raising the cap shrinks the hidden count and moves the line;
    // dropping it to the full roster removes the line entirely.
    const input = canvasElement.querySelector('[data-testid="max-visible-input"]');
    if (!(input instanceof HTMLInputElement)) throw new Error("expected the maxVisible input");
    await userEvent.clear(input);
    await userEvent.type(input, "5");
    await waitFor(() => {
      expect(canvasElement.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(5);
      expect(canvasElement.querySelector('[data-slot="port-edge-more"]')?.textContent).toBe("+1 more");
    });

    await userEvent.clear(input);
    await userEvent.type(input, "6");
    await waitFor(() => {
      expect(canvasElement.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(6);
      expect(canvasElement.querySelector('[data-slot="port-edge-more"]')).toBeNull();
    });
  },
};

/* ------------------------------------------------------------------ */
/* EditModeSingleVsMulti — F-1 resumed: the third state ("either only a  */
/* single line will appear, or the full multi line will appear").       */
/* ------------------------------------------------------------------ */

/**
 * F-1's own sentence names three states, not two: resting (identical either
 * way), armed + single-line (one port's own inline `CodeEditor`), armed +
 * multi-line (the rail-wide lane, `PortLaneOverlay`). `editMode` is the
 * seam that picks between the second and third — per-edge, matching how
 * `mode`/`groupMode` already work on this component, and defaulting to
 * `"single"` because renaming one port is the common case; a caller opts
 * into the bigger, rarer capability (paste a block of text, add/remove/
 * reorder ports in one edit) rather than the small one being the special
 * case. See `PortEdgeProps.editMode`'s own doc in `portEdge.tsx` for the
 * full reasoning, including the graceful fallback to `"single"` when the
 * lane's own preconditions (column edge, auto mode, no collapsed group)
 * are not met.
 */
function EditModeDemo() {
  const [editMode, setEditMode] = useState<"single" | "multi">("single");
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<PortEdgeItem[]>([
    { id: "pose", label: "pose", state: "wired" },
    { id: "gain", label: "gain", state: "empty" },
    { id: "reset", label: "reset", state: "empty" },
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Segmented options={[{ value: "single", label: "Single-line" }, { value: "multi", label: "Multi-line" }]} value={editMode} onChange={setEditMode} />
        <button
          type="button"
          data-testid="edit-mode-toggle"
          onClick={() => setEditing((v) => !v)}
          style={{
            padding: "4px 10px",
            fontSize: 12,
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: editing ? "var(--accent)" : "transparent",
            color: "var(--foreground)",
            cursor: "pointer",
          }}
        >
          {editing ? "Disable label editing" : "Enable label editing"}
        </button>
      </div>
      <PortEdge edge="left" items={items} onItemsChange={setItems} editing={editing} onEditingChange={setEditing} editMode={editMode} size={{ width: 200, height: 220 }} />
    </div>
  );
}

export const EditModeSingleVsMulti: Story = {
  render: () => <EditModeDemo />,
  play: async ({ canvasElement }) => {
    const modeToggle = (label: string) => {
      const btn = Array.from(canvasElement.querySelectorAll("button")).find((b) => b.textContent?.trim() === label);
      if (!btn) throw new Error(`expected a "${label}" button`);
      return btn;
    };
    const editToggle = canvasElement.querySelector('[data-testid="edit-mode-toggle"]');
    if (!(editToggle instanceof HTMLButtonElement)) throw new Error("expected the editing toggle button");

    // --- F1h: armed + SINGLE-line mode + click a port -----------------
    await userEvent.click(editToggle); // arm
    await expect(canvasElement.querySelector('[data-slot="port-edge-lane"]')).toBeNull();

    const firstLabelSingle = canvasElement.querySelector('[data-slot="port-label-display"]');
    if (!(firstLabelSingle instanceof HTMLElement)) throw new Error("expected a port label to click");
    await userEvent.click(firstLabelSingle);

    // Exactly one CodeEditor — this port's own — and no lane element at all.
    await waitFor(() => {
      expect(canvasElement.querySelectorAll('[data-slot="code-editor"]')).toHaveLength(1);
    });
    await expect(canvasElement.querySelector('[data-slot="port-edge-lane"]')).toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-slot="code-editor"]')).toHaveLength(0));

    await userEvent.click(editToggle); // disarm, resets to resting

    // --- F1g: armed + MULTI-line mode + click a port -------------------
    await userEvent.click(modeToggle("Multi-line"));
    await userEvent.click(editToggle); // arm

    // No lane before the click — arming alone still paints nothing, mode
    // notwithstanding (F1a's own guarantee holds for BOTH modes).
    await expect(canvasElement.querySelector('[data-slot="port-edge-lane"]')).toBeNull();
    await expect(canvasElement.querySelectorAll('[data-slot="code-editor"]')).toHaveLength(0);

    const firstMember = canvasElement.querySelector('[data-slot="port-edge-member"]');
    if (!(firstMember instanceof HTMLElement)) throw new Error("expected a port to click");
    await userEvent.click(firstMember);

    // The lane element now exists — the rail-wide editor, not a per-port one.
    await waitFor(() => {
      const lane = canvasElement.querySelector('[data-slot="port-edge-lane"]');
      expect(lane).not.toBeNull();
    });
    await waitFor(() => {
      expect(canvasElement.querySelectorAll('[data-slot="code-editor"]')).toHaveLength(1);
    });
    // And clicking a DIFFERENT port while the lane is open does not spawn a
    // second editor — multi mode's click target is "open the shared lane",
    // not "edit this port", so a second click is a no-op on an already-open
    // lane, never a second mount.
    const members = Array.from(canvasElement.querySelectorAll('[data-slot="port-edge-member"]'));
    if (members[1]) await userEvent.click(members[1]);
    await expect(canvasElement.querySelectorAll('[data-slot="code-editor"]')).toHaveLength(1);
  },
};

